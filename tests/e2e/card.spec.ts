import { test, expect, type Page } from '@playwright/test';
import type { RuntimeApi } from '../../dev/runtime';
import type { AviadiloMap } from '../../src/aviadilo-map';
declare global {
  interface Window {
    aviadiloTest: RuntimeApi;
  }
}
const external: string[] = [];
test.beforeEach(async ({ page }) => {
  external.length = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.href);
    return route.abort();
  });
});
async function runtime(page: Page) {
  await page.goto('/runtime.html');
  await expect(
    page
      .locator('aviadilo-map')
      .locator('aviadilo-aircraft-list')
      .getByRole('button', { name: 'DEMO1', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.aviadiloTest.inspect(0).radar?.images ?? 0),
    )
    .toBeGreaterThan(0);
}
test('composes four layers with responsive keyboard list selection and stable manual view', async ({
  page,
}) => {
  await runtime(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator('aviadilo-map');
  await card
    .locator('aviadilo-aircraft-list')
    .getByRole('button', { name: 'DEMO1', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).selected))
    .toBe('adsb_fi:synthetic0');
  await page.evaluate(() => window.aviadiloTest.move(0, 34.25, -117.85));
  const before = await page.evaluate(
    () => window.aviadiloTest.inspect(0).center,
  );
  await page.evaluate(() => {
    window.aviadiloTest.updateHass(true);
    window.aviadiloTest.emit();
  });
  await expect(card.locator('.person-marker')).toHaveCount(1);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await card.getByRole('button', { name: 'Recenter', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).suspended))
    .toBe(false);
});
test('reference marker defaults on and toggles without affecting data demand or the viewport', async ({
  page,
}) => {
  await runtime(page);
  const card = page.locator('aviadilo-map');
  const marker = card.locator('.reference-marker');
  await expect(marker).toHaveCount(1);
  await expect(
    card.locator('.reference-icon[title="You are here — Home Assistant home"]'),
  ).toHaveCount(1);
  const before = await page.evaluate(() => ({
    center: window.aviadiloTest.inspect(0).center,
    calls: window.aviadiloTest.stats().calls.length,
  }));
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, show_you_are_here: false },
    });
  });
  await expect(marker).toHaveCount(0);
  expect(
    await page.evaluate(() => window.aviadiloTest.stats().calls.length),
  ).toBe(before.calls);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before.center);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, show_you_are_here: true },
    });
  });
  await expect(marker).toHaveCount(1);
  await page.evaluate(() => {
    window.aviadiloTest.config(0, {
      layers: { aircraft: false, radar: false, wind: false, people: false },
    });
  });
  await expect(marker).toHaveCount(1);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, layout: 'list' },
    });
  });
  await expect(marker).toHaveCount(0);
});
test('shares feed across viewers and keeps subscriptions across reactive hass and local edits', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => window.aviadiloTest.add());
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(2);
  const before = await page.evaluate(
    () =>
      window.aviadiloTest
        .stats()
        .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
  );
  await page.evaluate(() => {
    window.aviadiloTest.updateHass();
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      radar: { ...card.config.radar, opacity: 0.3 },
    });
  });
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
    ),
  ).toBe(before);
  await page.evaluate(() => {
    window.aviadiloTest.detach(0);
    window.aviadiloTest.detach(1);
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  expect(await page.evaluate(() => window.aviadiloTest.stats().listeners)).toBe(
    0,
  );
  await page.evaluate(() => window.aviadiloTest.attach(0));
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(1);
});
test('list layout requests aircraft alone and disabled wind has no demand', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { map: { layout: 'list' } }),
  );
  await expect(page.locator('aviadilo-map .map')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.aviadiloTest
            .stats()
            .calls.filter((c) => c.type === 'aviadilo/update_subscription')
            .at(-1)?.layers,
      ),
    )
    .toEqual({ aircraft: true, radar: false, wind: false });
  await page.evaluate(() =>
    window.aviadiloTest.config(0, {
      map: { layout: 'combined' },
      layers: { aircraft: false, radar: false, wind: false, people: true },
    }),
  );
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(2);
});
test('viewport race aborts old tiles, ignores stale events, and preserves paused frame on metadata refresh', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    window.aviadiloTest.tiles(250);
    window.aviadiloTest.move(0, 34.3, -117.6);
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.aviadiloTest.move(0, 34.4, -117.5);
    window.aviadiloTest.stale();
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.aviadiloTest.inspect(0).radar?.state),
    )
    .toBe('current');
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).aircraft),
  ).toBe(3);
  expect(
    await page.evaluate(() => window.aviadiloTest.stats().aborts),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.aviadiloTest.tiles(0);
    window.aviadiloTest.seek(0, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.aviadiloTest.inspect(0).radar?.index),
    )
    .toBe(0);
  await page.evaluate(() => window.aviadiloTest.emit());
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).radar?.index),
  ).toBe(0);
});
test('recovers HA reconnect and integration recreation while people remain usable', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => window.aviadiloTest.connectionEvent(false));
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(2);
  await page.evaluate(() => {
    window.aviadiloTest.entry('replacement');
    window.aviadiloTest.connectionEvent(true);
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.aviadiloTest
            .stats()
            .calls.filter((c) => c.type === 'aviadilo/subscribe')
            .at(-1)?.entry_id,
      ),
    )
    .toBe('replacement');
  await page.evaluate(() => {
    window.aviadiloTest.stopFeed();
    window.aviadiloTest.sourceError();
  });
  const indicator = page.getByRole('button', {
    name: 'Map data needs attention',
  });
  await expect(indicator).toBeVisible({ timeout: 20000 });
  await indicator.click();
  await expect(
    page
      .getByRole('dialog', { name: 'Map data status' })
      .getByText('Aircraft · unavailable', { exact: true }),
  ).toBeVisible();
});
test('raw HA picker without transport is honestly unavailable and settings round trip', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const original = document.querySelector('aviadilo-map') as AviadiloMap;
    const picker = document.createElement('hui-card-picker');
    const card = document.createElement('aviadilo-map') as AviadiloMap;
    card.setConfig({
      schema_version: 1,
      type: 'custom:aviadilo-map',
      layers: { aircraft: true, radar: true, wind: true },
      wind: { static_style: 'arrows' },
    });
    card.hass = {
      config: { latitude: 0, longitude: 0 },
      states: {},
      callWS: async () => {
        throw new Error('Integration unavailable');
      },
    };
    original.remove();
    picker.append(card);
    document.body.prepend(picker);
    await card.updateComplete;
  });
  const pickerIndicator = page
    .locator('hui-card-picker')
    .getByRole('button', { name: 'Map data needs attention' });
  await expect(pickerIndicator).toHaveCount(0);
  await expect(pickerIndicator).toBeVisible({ timeout: 20000 });
  await pickerIndicator.click();
  await expect(
    page
      .locator('hui-card-picker')
      .getByRole('dialog', { name: 'Map data status' }),
  ).toContainText('Integration unavailable');
  await expect(
    page
      .locator('hui-card-picker')
      .locator('aviadilo-aircraft-list')
      .getByRole('button', { name: 'DEMO1', exact: true }),
  ).toHaveCount(0);
  expect(external).toEqual([]);
  const editor = page.locator('aviadilo-map-editor');
  await editor.locator('#title').fill('Saved synthetic map');
  await editor.locator('#title').dispatchEvent('change');
  await expect(editor.locator('#title')).toHaveValue('Saved synthetic map');
  await editor
    .locator('summary')
    .filter({ hasText: /^Aircraft$/ })
    .click();
  await editor.locator('#aircraft-min_altitude_m').fill('0');
  await editor.locator('#aircraft-min_altitude_m').dispatchEvent('change');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('hidden cards and collapsed list-only cards stop demand and clean weather resources', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    (document.querySelector('aviadilo-map') as HTMLElement).style.display =
      'none';
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).radar?.buffered),
  ).toBe(0);
  await page.evaluate(() => {
    (document.querySelector('aviadilo-map') as HTMLElement).style.display = '';
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(1);
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { map: { layout: 'list' } }),
  );
  await page.locator('aviadilo-map .aircraft-list > summary').click();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await page.locator('aviadilo-map .aircraft-list > summary').click();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(1);
});

test('initial unavailable integration and explicit entry selection recover through passive discovery', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    window.aviadiloTest.detach(0);
    window.aviadiloTest.unavailable(true);
    window.aviadiloTest.attach(0);
  });
  const unavailable = page.getByRole('button', {
    name: 'Map data needs attention',
  });
  await expect(unavailable).toHaveCount(0);
  await expect(unavailable).toBeVisible({ timeout: 20000 });
  await unavailable.click();
  await expect(
    page.getByRole('dialog', { name: 'Map data status' }),
  ).toContainText('Integration unavailable');
  await page.keyboard.press('Escape');
  await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(2);
  await page.evaluate(() => {
    window.aviadiloTest.unavailable(false);
    window.aviadiloTest.entry('recreated');
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(1);
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { entry_id: 'explicit' }),
  );
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await page.evaluate(() => window.aviadiloTest.entry('explicit'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.aviadiloTest
            .stats()
            .calls.filter((c) => c.type === 'aviadilo/subscribe')
            .at(-1)?.entry_id,
      ),
    )
    .toBe('explicit');
});

test('people-only runtime works without an HA transport and never requests external data', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    card.preview = false;
    card.setConfig({
      schema_version: 1,
      type: 'custom:aviadilo-map',
      map: { layout: 'map' },
      layers: { aircraft: false, radar: false, wind: false },
      people: { trackers: [{ entity_id: 'device_tracker.synthetic' }] },
    });
    card.hass = {
      config: { latitude: 34.1, longitude: -117.72 },
      states: {
        'device_tracker.synthetic': {
          state: 'home',
          attributes: {
            latitude: 34.1,
            longitude: -117.72,
            friendly_name: 'SYNTHETIC',
          },
        },
      },
    };
    await card.updateComplete;
  });
  await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(1);
  expect(external).toEqual([]);
});

test('cards created hidden never open a transient provider subscription', async ({
  page,
}) => {
  await runtime(page);
  const before = await page.evaluate(
    () =>
      window.aviadiloTest
        .stats()
        .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
  );
  await page.evaluate(() => window.aviadiloTest.add(undefined, true));
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
    ),
  ).toBe(before);
  await page.evaluate(() => {
    (
      document.querySelectorAll('aviadilo-map')[1] as HTMLElement
    ).style.display = '';
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(2);
});

test('public sizing contract keeps a following sections card below expanded content', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const options = card.getGridOptions() as { columns: number; rows?: number };
    const grid = card.parentElement!;
    grid.style.cssText =
      'display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:minmax(56px,auto);gap:8px';
    card.style.gridColumn = `span ${options.columns}`;
    if (options.rows) card.style.gridRow = `span ${options.rows}`;
    const following = document.createElement('article');
    following.id = 'following-card';
    following.style.cssText = 'grid-column:1/-1;min-height:100px';
    following.textContent = 'Following dashboard card';
    grid.append(following);
  });
  await page.locator('aviadilo-map .aircraft-list > summary').click();
  const before = await page.locator('#following-card').boundingBox();
  await page.locator('aviadilo-map .aircraft-list > summary').click();
  await expect
    .poll(async () => (await page.locator('#following-card').boundingBox())!.y)
    .toBeGreaterThan(before!.y);
  const boxes = await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    return {
      bottom: card.getBoundingClientRect().bottom,
      following: document
        .querySelector('#following-card')!
        .getBoundingClientRect().top,
      size: card.getCardSize(),
      height: card.getBoundingClientRect().height,
      options: card.getGridOptions(),
    };
  });
  expect(boxes.options).not.toHaveProperty('rows');
  expect(boxes.following).toBeGreaterThanOrEqual(boxes.bottom);
  expect(boxes.size * 50).toBeGreaterThanOrEqual(boxes.height);
});

test('theme and wind edits reuse mounted data, viewport, requests and selected modes', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => window.aviadiloTest.move(0, 34.25, -117.85));
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().assetActive))
    .toBe(0);
  await page.waitForTimeout(500);
  const evidence = await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    type Runtime = {
      client: object;
      basemap: object;
      wind: { view(): { grid: object } };
    };
    const internals = card as unknown as Runtime;
    const baseline = {
      client: internals.client,
      basemap: internals.basemap,
      grid: internals.wind.view().grid,
    };
    const before = window.aviadiloTest.stats();
    const view = window.aviadiloTest.inspect(0);
    const appearances = [];
    for (const theme of ['light', 'dark', 'auto'] as const) {
      card.hass = { ...card.hass!, themes: { darkMode: true } };
      for (const mode of ['arrows', 'barbs', 'particles'] as const) {
        card.setConfig({
          ...card.config,
          map: { ...card.config.map, theme },
          wind: { ...card.config.wind, mode, color: '#12aBcD' },
        });
        await card.updateComplete;
        appearances.push({
          theme: card
            .shadowRoot!.querySelector('article')!
            .getAttribute('data-theme'),
          mode: card.config.wind!.mode,
          attributionBackground: getComputedStyle(
            card.shadowRoot!.querySelector('.attribution')!,
          ).backgroundColor,
          attributionText: getComputedStyle(
            card.shadowRoot!.querySelector('.attribution')!,
          ).color,
        });
      }
    }
    const panes = [
      'basemap',
      'radar',
      'wind',
      'aircraft',
      'people',
      'popup',
    ].map((name) => {
      const element = card.shadowRoot!.querySelector(`.leaflet-${name}-pane`)!;
      return { name, filter: getComputedStyle(element).filter };
    });
    return {
      before,
      after: window.aviadiloTest.stats(),
      view,
      current: window.aviadiloTest.inspect(0),
      appearances,
      panes,
      same:
        baseline.client === internals.client &&
        baseline.basemap === internals.basemap &&
        baseline.grid === internals.wind.view().grid,
    };
  });
  expect(evidence.same).toBe(true);
  expect(evidence.after.calls).toEqual(evidence.before.calls);
  expect(evidence.after.assets).toEqual(evidence.before.assets);
  expect(evidence.after.tiles).toEqual(evidence.before.tiles);
  expect(evidence.current.center).toEqual(evidence.view.center);
  expect(evidence.current.zoom).toBe(evidence.view.zoom);
  expect(evidence.appearances.map((value) => value.theme)).toEqual([
    'light',
    'light',
    'light',
    'dark',
    'dark',
    'dark',
    'dark',
    'dark',
    'dark',
  ]);
  for (const appearance of evidence.appearances) {
    expect(appearance.attributionBackground).toBe(
      appearance.theme === 'dark' ? 'rgb(25, 41, 56)' : 'rgb(255, 255, 255)',
    );
    expect(appearance.attributionText).toBe(
      appearance.theme === 'dark' ? 'rgb(230, 237, 245)' : 'rgb(23, 41, 57)',
    );
  }
  expect(
    evidence.panes.find((pane) => pane.name === 'basemap')!.filter,
  ).toContain('invert(1)');
  expect(
    evidence.panes
      .filter((pane) => pane.name !== 'basemap')
      .every((pane) => pane.filter === 'none'),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('graphical wind editor retains inactive settings and blocks all saves while a draft is invalid', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('aviadilo-map-editor');
  const reference = editor.getByLabel('Show “You are here” marker');
  await expect(reference).toBeChecked();
  await reference.uncheck();
  await expect(page.locator('aviadilo-map .reference-marker')).toHaveCount(0);
  await editor
    .locator('summary')
    .filter({ hasText: /^Wind$/ })
    .click();
  await expect(editor.locator('#wind-marker_spacing_px')).toBeVisible();
  await expect(editor.locator('#wind-particle_count')).toHaveCount(0);
  // Commit through native blur so synthetic change events cannot leave a
  // delayed valid edit pending when the invalid-draft measurement starts.
  await editor.locator('#wind-marker_spacing_px').fill('80');
  await editor.locator('#wind-marker_spacing_px').press('Tab');
  await editor.locator('#wind-mode').selectOption('particles');
  await expect(editor.locator('#wind-marker_spacing_px')).toHaveCount(0);
  await expect(editor.locator('#wind-particle_count')).toBeVisible();
  await editor.locator('#wind-particle_count').fill('73');
  await editor.locator('#wind-particle_count').press('Tab');
  await editor.locator('#wind-mode').selectOption('barbs');
  await expect(editor.locator('#wind-marker_spacing_px')).toHaveValue('80');
  await page.evaluate(() => {
    const editor = document.querySelector('aviadilo-map-editor')!;
    editor.setAttribute('data-saves', '0');
    editor.addEventListener('config-changed', () =>
      editor.setAttribute(
        'data-saves',
        String(Number(editor.getAttribute('data-saves')) + 1),
      ),
    );
  });
  await editor.locator('#wind-color').fill('#bad');
  await editor.locator('#wind-color').press('Tab');
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor).toHaveAttribute('data-saves', '0');
  await editor.locator('#title').fill('Pending title');
  await editor.locator('#title').press('Tab');
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.locator('#wind-color')).toHaveValue('#bad');
  await expect(editor.locator('#title')).toHaveValue('Pending title');
  await expect(editor).toHaveAttribute('data-saves', '0');
  await editor.locator('#wind-color').fill('#12aBcD');
  await editor.locator('#wind-color').press('Tab');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await expect(editor).toHaveAttribute('data-saves', '1');
  await editor.locator('#wind-mode').selectOption('particles');
  await expect(editor.locator('#wind-particle_count')).toHaveValue('73');
  await expect(page.locator('aviadilo-map h2')).toHaveText('Pending title');
  expect(
    await page.evaluate(
      () =>
        (document.querySelector('aviadilo-map') as AviadiloMap).config
          .schema_version,
    ),
  ).toBe(2);
});

test('healthy card stays quiet and errors have accessible keyboard and outside dismissal', async ({
  page,
}) => {
  await page.clock.install();
  await runtime(page);
  const card = page.locator('aviadilo-map');
  const indicator = card.getByRole('button', {
    name: 'Map data needs attention',
  });
  await expect(indicator).toHaveCount(0);
  await expect(card.locator('.weather, .status, footer')).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: /^(Latest|Loop|Pause)$/ }),
  ).toHaveCount(0);
  await expect(card.locator('figure, input, select')).toHaveCount(0);
  await expect(card.locator('.attribution')).toHaveCount(1);
  for (const name of [
    '© OpenStreetMap contributors',
    'adsb.fi',
    'RainViewer',
    'DWD ICON-global',
  ])
    await expect(
      card.locator('.attribution').getByRole('link', { name, exact: true }),
    ).toBeVisible();
  await page.evaluate(() => window.aviadiloTest.stopFeed());
  await page.clock.fastForward(16000);
  await expect(indicator).toHaveCount(0);
  await page.evaluate(() => window.aviadiloTest.sourceError());
  await expect(indicator).toBeVisible();
  await indicator.focus();
  await page.keyboard.press('Enter');
  const dialog = card.getByRole('dialog', { name: 'Map data status' });
  await expect(dialog).toBeFocused();
  await expect(indicator).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog).toContainText('Aircraft · unavailable');
  await expect(dialog).toContainText('Radar · unavailable');
  await expect(dialog).toContainText('Model valid:');
  await expect(dialog).toContainText('Displayed radar frame:');
  await expect(dialog.locator('input, select')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(indicator).toBeFocused();
  await indicator.click();
  await page.locator('h1').click();
  await expect(dialog).toHaveCount(0);
  await card.getByRole('button', { name: 'Recenter', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).suspended))
    .toBe(false);
  await page.evaluate(() => window.aviadiloTest.emit());
  await expect(indicator).toHaveCount(0);
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { map: { layout: 'list' } }),
  );
  await expect(card.locator('.attribution')).toHaveCount(1);
  await expect(card.locator('.attribution a')).toHaveCount(1);
  await expect(
    card.locator('.attribution').getByRole('link', { name: 'adsb.fi' }),
  ).toBeVisible();
});

test('editor inspection observes matching rendered timestamps and reduced motion without collecting data', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await runtime(page);
  await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    card.setConfig({
      ...card.config,
      wind: { ...card.config.wind, mode: 'particles' },
    });
    await card.updateComplete;
    const editor = document.createElement(
      'aviadilo-map-editor',
    ) as import('../../src/editor/editor').AviadiloEditor;
    editor.hass = card.hass;
    editor.setConfig(card.config);
    document.querySelector('main')!.style.cssText =
      'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';
    editor.style.cssText = 'height:700px;overflow:auto';
    document.querySelector('main')!.append(editor);
    window.aviadiloTest.stopFeed();
  });
  // Adding the second column resizes the map and starts an ordinary revision.
  // Capture the last displayed frame after that revision, before editor scrolling
  // can hide the source card and release its renderer resources.
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).radar?.time))
    .toEqual(expect.any(String));
  const time = await page.evaluate(
    () => window.aviadiloTest.inspect(0).radar!.time,
  );
  expect(time).not.toBeNull();
  const before = await page.evaluate(
    () =>
      window.aviadiloTest
        .stats()
        .calls.filter((call) => call.type === 'aviadilo/subscribe').length,
  );
  const editor = page.locator('aviadilo-map-editor');
  await editor.getByText('Live inspection', { exact: true }).click();
  const inspection = editor.getByLabel('Live inspection', { exact: true });
  await expect(inspection).toContainText(
    'Reduced motion is enabled: saved particle mode uses arrows.',
  );
  await expect(inspection.locator('time').first()).toHaveAttribute(
    'datetime',
    time!,
  );
  await expect(
    inspection.getByRole('figure', {
      name: 'RainViewer Universal Blue reflectivity in dBZ',
    }),
  ).toBeVisible();
  await expect(inspection.locator('input, select, button')).toHaveCount(0);
  await editor.getByText('Live inspection', { exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .calls.filter((call) => call.type === 'aviadilo/subscribe').length,
    ),
  ).toBe(before);
  await page.evaluate(() => {
    (document.querySelector('aviadilo-map') as HTMLElement).style.display =
      'none';
  });
  await editor.getByText('Live inspection', { exact: true }).click();
  await expect(inspection).toContainText(
    'Card is not visible; data collection is paused.',
  );
  await expect(inspection.locator('time').first()).toHaveAttribute(
    'datetime',
    time!,
  );
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await page.evaluate(() => window.aviadiloTest.detach(0));
  await expect(inspection).toContainText(
    'No matching mounted card is available',
  );
});

test('short list-only cards keep failure details readable without changing closed height', async ({
  page,
}) => {
  await page.clock.install();
  await runtime(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.aviadiloTest.stopFeed();
    window.aviadiloTest.detach(0);
    window.aviadiloTest.config(0, {
      title: '',
      map: { layout: 'list', show_recenter: false },
      layers: { aircraft: true, radar: false, wind: false, people: false },
    });
    window.aviadiloTest.unavailable(true);
    window.aviadiloTest.attach(0);
  });
  await expect(page.locator('aviadilo-map .map')).toBeHidden();
  await page.clock.runFor(1000);
  await page.clock.fastForward(16000);
  const card = page.locator('aviadilo-map');
  const indicator = card.getByRole('button', {
    name: 'Map data needs attention',
  });
  await expect(indicator).toBeVisible();
  const before = await card.boundingBox();
  expect(before!.height).toBeLessThan(240);
  await indicator.click();
  const dialog = card.getByRole('dialog', { name: 'Map data status' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.height).toBeGreaterThan(150);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(dialog).toContainText('Aircraft · configuration required');
  await expect(dialog).toContainText('Devices & services');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(indicator).toBeFocused();
  expect((await card.boundingBox())!.height).toBe(before!.height);
});

test('hidden layer buttons restore saved layers and keep Recenter and error inspection independent', async ({
  page,
}) => {
  await page.clock.install();
  await runtime(page);
  const card = page.locator('aviadilo-map');
  const people = card.locator('.person-marker');
  await expect(people.first()).toBeVisible();
  const savedPeople = await people.evaluateAll((markers) =>
    markers.map((marker) => marker.textContent).sort(),
  );
  expect(savedPeople.length).toBeGreaterThan(0);
  await card.getByRole('button', { name: 'People', exact: true }).click();
  await expect(card.locator('.person-marker')).toHaveCount(0);
  await page.evaluate(() => {
    const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
    card.setConfig({
      ...card.config,
      map: {
        ...card.config.map,
        layout: 'map',
        show_layer_buttons: false,
        show_recenter: false,
      },
    });
  });
  await expect(people).toHaveCount(savedPeople.length);
  await expect
    .poll(() =>
      people.evaluateAll((markers) =>
        markers.map((marker) => marker.textContent).sort(),
      ),
    )
    .toEqual(savedPeople);
  await expect(card.locator('nav')).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'Recenter', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
    card.setConfig({
      ...card.config,
      map: { ...card.config.map, show_recenter: true },
    });
  });
  await expect(
    card.getByRole('button', { name: 'Recenter', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'People', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
    card.setConfig({
      ...card.config,
      map: { ...card.config.map, show_recenter: false },
    });
  });
  await page.evaluate(() => window.aviadiloTest.stopFeed());
  await page.clock.fastForward(16000);
  await page.evaluate(() => window.aviadiloTest.sourceError());
  await expect(
    card.getByRole('button', { name: 'Map data needs attention' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(card.locator('nav')).toHaveCSS('position', 'absolute');
  await card.getByRole('button', { name: 'Map data needs attention' }).click();
  await expect(
    card.getByRole('dialog', { name: 'Map data status' }),
  ).toContainText('Synthetic provider failure');
  await card.getByRole('button', { name: 'Close status', exact: true }).click();
  await expect(
    card.getByRole('link', { name: '© OpenStreetMap contributors' }),
  ).toBeVisible();
  expect(external).toEqual([]);
});

test('auto page height settles across nested scrolling, layout and viewport changes with mounted identity and manual view intact', async ({
  page,
}) => {
  await runtime(page);
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.evaluate(() => {
    const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
    const internals = card as unknown as {
      map: unknown;
      client: unknown;
      assets: unknown;
    };
    (window as unknown as { layoutIdentity: unknown }).layoutIdentity = [
      internals.map,
      internals.client,
      internals.assets,
    ];
    card.setConfig({
      ...card.config,
      title: 'Page height',
      map: {
        ...card.config.map,
        layout: 'map',
        height_px: 333,
        auto_height: true,
        show_layer_buttons: false,
        show_recenter: false,
        idle_return_s: null,
      },
    });
    window.aviadiloTest.move(0, 34.25, -117.85, 9);
  });
  const card = page.locator('aviadilo-map');
  const geometry = () =>
    card.evaluate((element) => {
      const article = element
        .shadowRoot!.querySelector('article')!
        .getBoundingClientRect();
      const map = element
        .shadowRoot!.querySelector('.map')!
        .getBoundingClientRect();
      return { bottom: article.bottom + window.scrollY, height: map.height };
    });
  await expect
    .poll(async () => Math.abs((await geometry()).bottom - 984))
    .toBeLessThan(1);
  const before = await page.evaluate(() => window.aviadiloTest.inspect(0));
  await page.evaluate(() => {
    const below = document.createElement('div');
    below.style.height = '1000px';
    document.body.append(below);
    window.scrollTo(0, 100);
  });
  const height = (await geometry()).height;
  await expect.poll(async () => (await geometry()).height).toBe(height);
  await page.setViewportSize({ width: 1000, height: 850 });
  await expect
    .poll(async () => Math.abs((await geometry()).bottom - 834))
    .toBeLessThan(1);
  const after = await page.evaluate(() => window.aviadiloTest.inspect(0));
  expect(after.center!.lat).toBeCloseTo(before.center!.lat, 5);
  expect(after.center!.lng).toBeCloseTo(before.center!.lng, 5);
  expect(after.zoom).toBe(before.zoom);
  expect(after.suspended).toBe(true);
  expect(
    await page.evaluate(() => {
      const internals = document.querySelector('aviadilo-map') as unknown as {
        map: unknown;
        client: unknown;
        assets: unknown;
      };
      const saved = (window as unknown as { layoutIdentity: unknown[] })
        .layoutIdentity;
      return [internals.map, internals.client, internals.assets].every(
        (value, index) => value === saved[index],
      );
    }),
  ).toBe(true);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('main')!;
    main.style.cssText = 'height:500px;overflow:auto';
    const top = document.createElement('div');
    top.id = 'layout-spacer';
    top.style.height = '100px';
    main.prepend(top);
  });
  const scrollportBottom = await page
    .locator('main')
    .evaluate(
      (main) =>
        main.getBoundingClientRect().top +
        window.scrollY +
        main.clientHeight -
        16,
    );
  await expect
    .poll(async () => Math.abs((await geometry()).bottom - scrollportBottom))
    .toBeLessThan(1);
  const nestedHeight = (await geometry()).height;
  await page.evaluate(() => {
    document.querySelector('main')!.scrollTop = 80;
  });
  await expect.poll(async () => (await geometry()).height).toBe(nestedHeight);
  await page.evaluate(() => {
    document.getElementById('layout-spacer')!.style.height = '140px';
  });
  await expect
    .poll(async () => (await geometry()).height)
    .toBe(nestedHeight - 40);
  await page.setViewportSize({ width: 1000, height: 300 });
  await expect(card.locator('.map')).toHaveCSS('height', '160px');
  await page.evaluate(() => {
    const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
    card.setConfig({
      ...card.config,
      map: { ...card.config.map, auto_height: false },
    });
  });
  await expect(card.locator('.map')).toHaveCSS('height', '333px');
  expect(external).toEqual([]);
});

test('graphical layout controls preserve saved height and block saves while another draft is invalid', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('aviadilo-map-editor');
  await editor.locator('#map-height_px').fill('777');
  await editor.locator('#map-height_px').press('Tab');
  await editor.getByLabel('Auto-size height to page', { exact: true }).check();
  await expect(editor.locator('#map-height_px')).toHaveCount(0);
  await editor.getByLabel('Show layer buttons', { exact: true }).uncheck();
  await editor
    .getByLabel('Auto-size height to page', { exact: true })
    .uncheck();
  await expect(editor.locator('#map-height_px')).toHaveValue('777');
  await editor.locator('#map-height_px').fill('0');
  await editor.locator('#map-height_px').press('Tab');
  await expect(editor.getByRole('alert')).toBeVisible();
  await editor.getByLabel('Show layer buttons', { exact: true }).check();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.locator('#map-height_px')).toHaveValue('0');
  await editor.locator('#map-height_px').fill('777');
  await editor.locator('#map-height_px').press('Tab');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('aircraft SVG kinds retain focus/popups on updates and type filters clear selection without feed demand', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => window.aviadiloTest.stopFeed());
  const card = page.locator('aviadilo-map');
  const markers = card.locator('.aviadilo-aircraft-icon');
  const plane = card.locator(
    '.aviadilo-aircraft-icon[data-aircraft-kind="airplanes"]',
  );
  const heli = card.locator(
    '.aviadilo-aircraft-icon[data-aircraft-kind="helicopters"]',
  );
  await expect(markers).toHaveCount(3);
  await expect(plane.locator('svg')).toHaveCount(1);
  await expect(heli.locator('svg')).toHaveCount(1);
  await expect(
    card.locator('svg[data-aircraft-kind="unknown"]'),
  ).toHaveAttribute('data-course-known', 'false');
  await expect(
    card.locator('.aviadilo-aircraft-icon[data-aircraft-kind="unknown"]'),
  ).toHaveAttribute('aria-label', /course unknown/);
  await expect(
    card.locator('svg[data-aircraft-kind="unknown"] [data-course-unknown]'),
  ).toBeVisible();
  const original = await heli.elementHandle();
  const originalSvg = await heli.locator('svg').elementHandle();
  await heli.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).selected))
    .toBe('adsb_fi:synthetic1');
  await page.evaluate(() => window.aviadiloTest.emit());
  expect(
    await heli.evaluate((node, previous) => node === previous, original),
  ).toBe(true);
  expect(
    await heli
      .locator('svg')
      .evaluate((node, previous) => node === previous, originalSvg),
  ).toBe(true);
  await expect(heli).toBeFocused();
  await expect(card.locator('.leaflet-popup')).toBeVisible();
  await card.locator('.leaflet-popup-close-button').click();
  await expect(card.locator('.leaflet-popup')).toHaveCount(0);
  await heli.focus();
  const scrollBeforeSpace = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(card.locator('.leaflet-popup')).toHaveCount(1);
  await expect(heli).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeSpace);
  await page.evaluate(() => window.aviadiloTest.emit());
  await expect(card.locator('.leaflet-popup')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).selected))
    .toBe('adsb_fi:synthetic1');
  const before = await page.evaluate(
    () => window.aviadiloTest.stats().calls.length,
  );
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      aircraft: {
        ...card.config.aircraft,
        types: ['helicopters'],
        marker_size_px: 32,
        marker_color: '#ff7700',
      },
    });
  });
  await expect(markers).toHaveCount(1);
  await expect(heli).toHaveCSS('width', '32px');
  await expect(heli.locator('svg')).toHaveCSS('color', 'rgb(255, 119, 0)');
  expect(
    await heli.evaluate((node, previous) => node === previous, original),
  ).toBe(true);
  await expect(
    card
      .locator('aviadilo-aircraft-list')
      .getByRole('button', { name: 'DEMO1', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      aircraft: { ...card.config.aircraft, types: [] },
    });
  });
  await expect(markers).toHaveCount(0);
  await expect(card.locator('.leaflet-popup')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).selected))
    .toBeUndefined();
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      aircraft: {
        ...card.config.aircraft,
        types: ['airplanes', 'helicopters', 'unknown'],
      },
    });
  });
  await expect(markers).toHaveCount(3);
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).selected))
    .toBeUndefined();
  expect(
    await page.evaluate(() => window.aviadiloTest.stats().calls.length),
  ).toBe(before);
  expect(external).toEqual([]);
});

test('graphical aircraft type checkboxes use friendly names and respect invalid drafts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.locator('aviadilo-map .aviadilo-aircraft-icon'),
  ).toHaveCount(3);
  const editor = page.locator('aviadilo-map-editor');
  await editor
    .locator('summary')
    .filter({ hasText: /^Aircraft$/ })
    .click();
  const types = editor.getByRole('group', {
    name: 'Aircraft types',
    exact: true,
  });
  await expect(types.getByRole('checkbox')).toHaveCount(10);
  await expect(
    types.getByRole('checkbox', { name: 'Balloons / airships', exact: true }),
  ).toBeChecked();
  await expect(
    types.getByRole('checkbox', {
      name: 'Ground vehicles / obstacles',
      exact: true,
    }),
  ).toBeChecked();
  await expect(types).toContainText('reported categories');
  const size = editor.locator('#aircraft-marker_size_px');
  await size.fill('1');
  await size.dispatchEvent('change');
  await expect(editor.getByRole('alert')).toBeVisible();
  await types
    .getByRole('checkbox', { name: 'Airplanes', exact: true })
    .uncheck();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(
    page.locator('aviadilo-map .aviadilo-aircraft-icon'),
  ).toHaveCount(3);
  await size.fill('24');
  await size.dispatchEvent('change');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await expect(
    page.locator(
      'aviadilo-map .aviadilo-aircraft-icon[data-aircraft-kind="airplanes"]',
    ),
  ).toHaveCount(0);
  for (const input of await types.getByRole('checkbox').all())
    await input.uncheck();
  await types
    .getByRole('checkbox', { name: 'Helicopters', exact: true })
    .check();
  await expect(
    page.locator('aviadilo-map .aviadilo-aircraft-icon'),
  ).toHaveCount(1);
  await expect(
    page.locator('aviadilo-map .aviadilo-aircraft-icon'),
  ).toHaveAttribute('data-aircraft-kind', 'helicopters');
});

test('person zone fallback keeps selected identity, truthful freshness, health and a stable manual view', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    window.aviadiloTest.config(0, {
      schema_version: 2,
      layers: { aircraft: false, radar: false, wind: false, people: true },
      people: {
        trackers: [{ entity_id: 'person.zone_only' }],
        accuracy_circles: true,
      },
    });
  });
  const card = page.locator('aviadilo-map');
  await expect(card.locator('.person-marker')).toHaveCount(1);
  await expect(card.locator('.person-marker')).toHaveText('JO');
  await card.locator('.person-marker').click();
  await expect(card.locator('.leaflet-popup-content')).toContainText(
    'Jordan · synthetic zone person',
  );
  await expect(card.locator('.leaflet-popup-content')).toContainText(
    'Zone location: Synthetic home · GPS age unknown',
  );
  await expect(card.locator('.person-accuracy')).toHaveCount(0);
  await expect(card.locator('.status-indicator')).toHaveCount(0);
  await page.evaluate(() => window.aviadiloTest.move(0, 34.25, -117.85));
  const before = await page.evaluate(
    () => window.aviadiloTest.inspect(0).center,
  );
  await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const hass = card.hass!;
    card.hass = {
      ...hass,
      states: {
        ...hass.states,
        'zone.home': {
          ...hass.states['zone.home'],
          attributes: {
            ...hass.states['zone.home'].attributes,
            longitude: 139.76,
          },
        },
      },
    };
    await card.updateComplete;
  });
  await expect(card.locator('.person-marker')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before);
  await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const hass = card.hass!;
    card.hass = {
      ...hass,
      states: {
        ...hass.states,
        'zone.home': {
          ...hass.states['zone.home'],
          attributes: {
            ...hass.states['zone.home'].attributes,
            longitude: -117.72,
          },
        },
      },
    };
    await card.updateComplete;
  });
  await expect(card.locator('.person-marker')).toHaveCount(1);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before);
  expect(external).toEqual([]);
});

test('people editor prefers persons and saves an existing tracker row without losing preferences', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('aviadilo-map-editor');
  await expect(editor.locator('#title')).toBeVisible();
  await page.evaluate(() => {
    const editor = document.querySelector(
      'aviadilo-map-editor',
    ) as import('../../src/editor/editor').AviadiloEditor;
    editor.setConfig({
      schema_version: 2,
      type: 'custom:aviadilo-map',
      people: {
        trackers: [
          {
            entity_id: 'device_tracker.synthetic',
            name: 'Custom person',
            icon: 'mdi:account',
            color: '#abcdef',
            show_photo: true,
          },
        ],
      },
    });
    editor.addEventListener('config-changed', (event) => {
      editor.setAttribute(
        'data-saved',
        JSON.stringify((event as CustomEvent).detail.config),
      );
    });
  });
  await editor
    .locator('summary')
    .filter({ hasText: /^People$/ })
    .click();
  await expect(
    editor.locator('#tracker-entities option').first(),
  ).toHaveAttribute('value', 'person.synthetic');
  const entity = editor.getByLabel('Person or device tracker entity', {
    exact: true,
  });
  await entity.fill('person.synthetic');
  await entity.press('Tab');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  const saved = JSON.parse((await editor.getAttribute('data-saved'))!);
  expect(saved.people.trackers).toEqual([
    {
      entity_id: 'person.synthetic',
      name: 'Custom person',
      icon: 'mdi:account',
      color: '#abcdef',
      show_photo: true,
    },
  ]);
  await page.evaluate((config) => {
    const editor = document.querySelector(
      'aviadilo-map-editor',
    ) as import('../../src/editor/editor').AviadiloEditor;
    editor.setConfig(config);
  }, saved);
  await expect(entity).toHaveValue('person.synthetic');
  await entity.fill('sensor.synthetic');
  await entity.press('Tab');
  await expect(editor.getByRole('alert')).toBeVisible();
  expect(JSON.parse((await editor.getAttribute('data-saved'))!)).toEqual(saved);
});

async function overlappingHousehold(page: Page, count = 3) {
  await page.evaluate((count) => {
    const trackers = Array.from({ length: count }, (_, index) => ({
      entity_id: `person.layout_${String(index).padStart(3, '0')}`,
      show_photo: index === 0,
    }));
    for (const [index, tracker] of trackers.entries())
      window.aviadiloTest.entity(tracker.entity_id, {
        state: 'home',
        last_updated: new Date().toISOString(),
        attributes: {
          latitude: 34.1,
          longitude: -117.72,
          friendly_name: `Household member ${index}`,
          gps_accuracy: 10,
          ...(index === 0
            ? {
                entity_picture:
                  'https://photos.aviadilo.invalid/layout?private=secret',
              }
            : {}),
        },
      });
    window.aviadiloTest.config(0, {
      layers: { aircraft: false, radar: false, wind: false, people: true },
      map: {
        layout: 'map',
        mode: 'home-area',
        height_px: 480,
        show_you_are_here: true,
      },
      people: { trackers, accuracy_circles: true, show_labels: true },
    });
  }, count);
}

test('overlapping individuals spread by default and retain photo/marker identity through timestamp updates', async ({
  page,
}) => {
  await runtime(page);
  await overlappingHousehold(page);
  const card = page.locator('aviadilo-map');
  await expect(card.locator('.person-marker')).toHaveCount(3);
  await expect(card.locator('.reference-marker')).toHaveCount(1);
  await expect(card.locator('.household-group')).toHaveCount(0);
  await expect(card.locator('.person-marker img')).toHaveCount(1);
  const before = await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const root = card.shadowRoot!;
    const identities = {
      marker: root.querySelector('.person-icon'),
      image: root.querySelector('.person-marker img'),
      map: (card as unknown as { map: unknown }).map,
    };
    Object.assign(window, { householdIdentities: identities });
    return window.aviadiloTest
      .stats()
      .assets.filter((path) => path.includes('/photo?')).length;
  });
  const boxes = await card
    .locator('.person-icon, .reference-icon')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
  for (let i = 0; i < boxes.length; i++)
    for (const b of boxes.slice(i + 1)) {
      const a = boxes[i];
      expect(
        a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      ).toBe(true);
    }
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const entity = card.hass!.states['person.layout_000'];
    window.aviadiloTest.entity('person.layout_000', {
      ...entity,
      last_updated: new Date(Date.now() - 1000).toISOString(),
    });
  });
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      const identities = (
        window as unknown as {
          householdIdentities: {
            marker: Element;
            image: Element;
            map: unknown;
          };
        }
      ).householdIdentities;
      return (
        identities.marker === card.shadowRoot!.querySelector('.person-icon') &&
        identities.image ===
          card.shadowRoot!.querySelector('.person-marker img') &&
        identities.map === (card as unknown as { map: unknown }).map
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .assets.filter((path) => path.includes('/photo?')).length,
    ),
  ).toBe(before);
  expect(await card.innerHTML()).not.toContain('private=secret');
  await page.keyboard.press('Escape');
  await expect(card.locator('.person-marker')).toHaveCount(3);
});

test('optional counted grouping expands by keyboard, collapses without changing view and cleans up members', async ({
  page,
}) => {
  await runtime(page);
  await overlappingHousehold(page);
  const before = await page.evaluate(() => ({
    center: window.aviadiloTest.inspect(0).center,
    calls: window.aviadiloTest.stats().calls.length,
  }));
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      people: { ...card.config.people, group_overlapping: true },
    });
  });
  const card = page.locator('aviadilo-map'),
    group = card.locator('.household-group');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveText('4');
  await expect(group).toHaveAccessibleName(/4 markers:.*You are here/);
  await expect(card.locator('.person-marker')).toHaveCount(0);
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.person-marker')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(group).toBeFocused();
  await page.keyboard.press('Space');
  await expect(card.locator('.person-marker')).toHaveCount(3);
  await card.locator('.map').click({ position: { x: 20, y: 100 } });
  await expect(card.locator('.person-marker')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before.center);
  expect(
    await page.evaluate(() => window.aviadiloTest.stats().calls.length),
  ).toBe(before.calls);
  await page.evaluate(() =>
    window.aviadiloTest.entity('person.layout_001', null),
  );
  await expect(group).toHaveText('3');
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { map: { layout: 'list' } }),
  );
  await expect(
    card.locator(
      '.household-group, .household-connector, .household-members, .person-marker, .reference-marker',
    ),
  ).toHaveCount(0);
});

test('a true singleton keeps its anchor through spreading and grouping with contrasting noninteractive connectors', async ({
  page,
}) => {
  await runtime(page);
  await overlappingHousehold(page);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, show_you_are_here: false },
    });
  });
  const card = page.locator('aviadilo-map');
  await expect(card.locator('.reference-marker')).toHaveCount(0);
  const scene = await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    const map = (card as unknown as { map: import('leaflet').Map }).map;
    const x = Math.round(map.getSize().x / 2);
    const origin = map.containerPointToLatLng([x, 240]);
    const singleton = map.containerPointToLatLng([x, 104]);
    for (const id of [
      'person.layout_000',
      'person.layout_001',
      'person.layout_002',
      'person.z_singleton',
    ]) {
      const position = id === 'person.z_singleton' ? singleton : origin;
      window.aviadiloTest.entity(id, {
        state: 'not_home',
        last_updated: new Date().toISOString(),
        attributes: {
          latitude: position.lat,
          longitude: position.lng,
          friendly_name: id,
          gps_accuracy: 10,
        },
      });
    }
    window.aviadiloTest.config(0, {
      people: {
        ...card.config.people,
        trackers: [
          ...card.config.people!.trackers!,
          { entity_id: 'person.z_singleton' },
        ],
      },
    });
    return { x, y: 104, center: window.aviadiloTest.inspect(0).center };
  });
  const singleton = card.locator(
    '.person-icon[data-member-id="person.z_singleton"]',
  );
  const anchor = () =>
    singleton.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const map = node.closest('.leaflet-container')!.getBoundingClientRect();
      return {
        x: box.x + box.width / 2 - map.x,
        y: box.y + box.height / 2 - map.y,
      };
    });
  const assertAnchor = async () => {
    await expect(singleton).toBeVisible();
    expect(await anchor()).toEqual({ x: scene.x, y: scene.y });
  };
  const assertClearFootprints = async () => {
    const points = await card
      .locator('.person-icon, .household-group-icon')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const group = node.classList.contains('household-group-icon');
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            width: group ? 56 : 144,
            height: group ? 56 : 128,
          };
        }),
      );
    for (const [index, a] of points.entries())
      for (const b of points.slice(index + 1))
        expect(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 8 ||
            Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 8,
        ).toBe(true);
  };
  await expect(card.locator('.person-marker')).toHaveCount(4);
  await assertAnchor();
  await assertClearFootprints();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((theme) => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      window.aviadiloTest.config(0, { map: { ...card.config.map, theme } });
    }, theme);
    await expect(card.locator('article')).toHaveAttribute('data-theme', theme);
    const paths = await card
      .locator('.household-connector-casing, .household-connector')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          casing: node.classList.contains('household-connector-casing'),
          stroke: node.getAttribute('stroke'),
          width: node.getAttribute('stroke-width'),
          cap: node.getAttribute('stroke-linecap'),
          pointer: getComputedStyle(node).pointerEvents,
          interactive: node.classList.contains('leaflet-interactive'),
          path: node.getAttribute('d'),
          belowMarkers:
            Number(getComputedStyle(node.closest('.leaflet-pane')!).zIndex) <
            Number(
              getComputedStyle(
                node.getRootNode() instanceof ShadowRoot
                  ? (node.getRootNode() as ShadowRoot).querySelector(
                      '.leaflet-people-pane',
                    )!
                  : document.querySelector('.leaflet-people-pane')!,
              ).zIndex,
            ),
        })),
      );
    expect(paths).toHaveLength(4);
    expect(paths.map((p) => p.casing)).toEqual([true, true, false, false]);
    for (const [index, path] of paths.entries()) {
      expect(path).toMatchObject({
        stroke: path.casing ? '#ffffff' : '#102131',
        width: path.casing ? '6' : '3',
        cap: 'round',
        pointer: 'none',
        interactive: false,
        belowMarkers: true,
      });
      if (index < 2) expect(path.path).toBe(paths[index + 2].path);
    }
    await assertAnchor();
  }
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      people: { ...card.config.people, group_overlapping: true },
    });
  });
  const group = card.locator('.household-group');
  await expect(group).toHaveText('3');
  await expect(
    card.locator('.household-connector, .household-connector-casing'),
  ).toHaveCount(0);
  await assertAnchor();
  await assertClearFootprints();
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.person-marker')).toHaveCount(4);
  await assertAnchor();
  await assertClearFootprints();
  await page.keyboard.press('Escape');
  await expect(group).toBeFocused();
  await assertAnchor();
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(scene.center);
  await page.evaluate(() =>
    window.aviadiloTest.config(0, { layers: { people: false } }),
  );
  await expect(
    card.locator(
      '.person-marker, .household-group, .household-connector, .household-connector-casing',
    ),
  ).toHaveCount(0);
});

test('constrained hundred-person view exposes every member in a scrollable keyboard-safe panel', async ({
  page,
}) => {
  await runtime(page);
  await overlappingHousehold(page, 100);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, height_px: 160 },
    });
  });
  const card = page.locator('aviadilo-map'),
    panel = card.locator('.household-members');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.household-member')).toHaveCount(101);
  await expect(panel.locator('.person-marker')).toHaveCount(100);
  await expect(card.locator('.household-group')).toHaveCount(0);
  const before = await page.evaluate(() => window.aviadiloTest.inspect(0));
  const last = panel.locator(
    '.person-icon[data-member-id="person.layout_099"]',
  );
  await last.focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.household-member-details')).toContainText(
    'Household member 99',
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('PageDown');
  const after = await page.evaluate(() => window.aviadiloTest.inspect(0));
  expect(after.center).toEqual(before.center);
  expect(after.suspended).toBe(before.suspended);
  const sizes = await panel.evaluate((element) => ({
    scroll: element.scrollHeight,
    height: element.clientHeight,
    width: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(sizes.scroll).toBeGreaterThan(sizes.height);
  expect(sizes.width).toBeLessThanOrEqual(sizes.client);
});

test('fit-people excludes aircraft, the reference, explicit zones and filtered travellers and honors manual views', async ({
  page,
}) => {
  await runtime(page);
  await page.evaluate(() => {
    window.aviadiloTest.updateHass(true);
    window.aviadiloTest.entity('zone.remote', {
      state: 'zoning',
      attributes: { latitude: 50, longitude: 20 },
    });
    window.aviadiloTest.config(0, {
      layers: { aircraft: true, radar: false, wind: false, people: true },
      map: {
        mode: 'fit-people',
        anchor: { kind: 'custom', latitude: 40, longitude: -100 },
        include_zones: ['zone.remote'],
        max_zoom: 14,
      },
      people: {
        trackers: [
          { entity_id: 'device_tracker.synthetic' },
          { entity_id: 'device_tracker.traveller' },
        ],
        radius_enabled: true,
        radius_m: 50000,
      },
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).zoom))
    .toBe(14);
  const center = await page.evaluate(
    () => window.aviadiloTest.inspect(0).center!,
  );
  expect(center.lat).toBeCloseTo(34.11, 2);
  expect(center.lng).toBeCloseTo(-117.72, 1);
  await expect(page.locator('.reference-marker, .household-group')).toHaveCount(
    0,
  );
  await page.evaluate(() => window.aviadiloTest.move(0, 35, -118, 8));
  const manual = await page.evaluate(
    () => window.aviadiloTest.inspect(0).center,
  );
  await page.evaluate(() => window.aviadiloTest.updateHass(true));
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(manual);
  await page
    .locator('aviadilo-map')
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).zoom))
    .toBe(14);
});

test('graphical editor saves the grouping checkbox and readable people-fit mode', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('aviadilo-map-editor');
  await expect(
    editor.locator('summary').filter({ hasText: /^Map$/ }),
  ).toBeVisible();
  await editor
    .getByLabel('Map view mode', { exact: true })
    .first()
    .selectOption('fit-people');
  await editor
    .locator('summary')
    .filter({ hasText: /^People$/ })
    .click();
  const checkbox = editor.getByRole('checkbox', {
    name: 'Group overlapping markers',
    exact: true,
  });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(
    editor.getByText(/Unchecked, overlapping markers spread/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      return {
        mode: card.config.map!.mode,
        grouping: card.config.people!.group_overlapping,
      };
    }),
  ).toEqual({ mode: 'fit-people', grouping: true });
  await checkbox.uncheck();
  expect(
    await page.evaluate(
      () =>
        (document.querySelector('aviadilo-map') as AviadiloMap).config.people!
          .group_overlapping,
    ),
  ).toBe(false);
});

test.describe('household touch controls', () => {
  test.use({ hasTouch: true });
  test('a counted group expands and collapses with touch without zooming', async ({
    page,
  }) => {
    await runtime(page);
    await overlappingHousehold(page);
    await page.evaluate(() => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      window.aviadiloTest.config(0, {
        people: { ...card.config.people, group_overlapping: true },
      });
    });
    const group = page.locator('aviadilo-map .household-group');
    await expect(group).toBeVisible();
    const box = await group.boundingBox();
    expect(box?.width).toBe(56);
    expect(box?.height).toBe(56);
    const before = await page.evaluate(() => ({
      center: window.aviadiloTest.inspect(0).center,
      zoom: window.aviadiloTest.inspect(0).zoom,
    }));
    await group.tap();
    await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(3);
    await group.tap();
    await expect(page.locator('aviadilo-map .person-marker')).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        center: window.aviadiloTest.inspect(0).center,
        zoom: window.aviadiloTest.inspect(0).zoom,
      })),
    ).toEqual(before);
  });
});

test('expanding a 101-marker group into overflow retains visible control focus and immediate Escape', async ({
  page,
}) => {
  await runtime(page);
  await overlappingHousehold(page, 100);
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      map: { ...card.config.map, height_px: 160 },
      people: { ...card.config.people, group_overlapping: true },
    });
  });
  const card = page.locator('aviadilo-map');
  const group = card.locator('.household-group');
  await expect(group).toHaveText('101');
  const before = await page.evaluate(() => ({
    center: window.aviadiloTest.inspect(0).center,
    zoom: window.aviadiloTest.inspect(0).zoom,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
  await group.click();
  const panel = card.locator('.household-members');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.household-member')).toHaveCount(102);
  await expect(
    panel.locator('.household-member').first().locator('.household-group'),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(group).toBeFocused();
  const boxes = await group.evaluate((button) => {
    const panel = button.closest('.household-members')!;
    const b = button.getBoundingClientRect(),
      p = panel.getBoundingClientRect();
    return {
      buttonTop: b.top,
      buttonBottom: b.bottom,
      panelTop: p.top,
      panelBottom: p.bottom,
    };
  });
  expect(boxes.buttonTop).toBeGreaterThanOrEqual(boxes.panelTop);
  expect(boxes.buttonBottom).toBeLessThanOrEqual(boxes.panelBottom);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(group).toBeFocused();
  expect(
    await page.evaluate(() => ({
      center: window.aviadiloTest.inspect(0).center,
      zoom: window.aviadiloTest.inspect(0).zoom,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    })),
  ).toEqual(before);
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(group).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

for (const selector of [
  '.person-icon[data-member-id="person.layout_000"]',
  '.reference-icon',
])
  test(`retains ${selector} focus when moving into and out of the member panel`, async ({
    page,
  }) => {
    await runtime(page);
    await overlappingHousehold(page);
    const card = page.locator('aviadilo-map'),
      marker = card.locator(selector);
    await expect(card.locator('.household-members')).toHaveCount(0);
    const originalSize = await card.evaluate((element) => ({
      width: (element as HTMLElement).style.width,
      height: (element as AviadiloMap).config.map!.height_px,
    }));
    await marker.focus();
    await page.evaluate(() => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      // Compact placement fits a short wide map; constrain both dimensions.
      card.style.width = '200px';
      window.aviadiloTest.config(0, {
        map: { ...card.config.map, height_px: 160 },
      });
    });
    await expect(card.locator('.household-members')).toBeVisible();
    await expect(marker).toBeFocused();
    await page.evaluate((originalSize) => {
      const card = document.querySelector('aviadilo-map') as AviadiloMap;
      card.style.width = originalSize.width;
      window.aviadiloTest.config(0, {
        map: { ...card.config.map, height_px: originalSize.height },
      });
    }, originalSize);
    await expect(card.locator('.household-members')).toHaveCount(0);
    await expect(marker).toBeFocused();
  });
