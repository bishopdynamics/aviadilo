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
    // Raster bytes are synthetic and never reach the public tile endpoint.
    if (url.hostname === 'tile.openstreetmap.org')
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          'base64',
        ),
      });
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
  await expect(
    card.getByText('1 people visible · 1 filtered or unavailable'),
  ).toBeVisible();
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
test('list layout requests aircraft alone and invisible wind has no demand', async ({
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
      layers: { aircraft: false, radar: false, wind: true, people: true },
      wind: { static_style: 'off', particles: false },
    }),
  );
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(0);
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('2 people visible · 0 filtered or unavailable'),
  ).toBeVisible();
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
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('2 people visible · 0 filtered or unavailable'),
  ).toBeVisible();
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
  await page.evaluate(() => window.aviadiloTest.sourceError());
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('Aircraft: unavailable', { exact: true }),
  ).toBeVisible();
});
test('raw HA picker and editor previews are entirely synthetic and settings round trip', async ({
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
        throw new Error('Preview accessed HA');
      },
    };
    original.remove();
    picker.append(card);
    document.body.prepend(picker);
    await card.updateComplete;
  });
  await expect(
    page
      .locator('hui-card-picker')
      .getByText('Synthetic · offline preview', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('hui-card-picker')
      .locator('aviadilo-aircraft-list')
      .getByRole('button', { name: 'DEMO1', exact: true }),
  ).toBeVisible();
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
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('Integration unavailable · people still use Home Assistant', {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('2 people visible · 0 filtered or unavailable'),
  ).toBeVisible();
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
    card.fixtureHass = undefined;
    card.setConfig({
      schema_version: 1,
      type: 'custom:aviadilo-map',
      map: { layout: 'list' },
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
  await expect(
    page
      .locator('aviadilo-map')
      .getByText('1 people visible · 0 filtered or unavailable'),
  ).toBeVisible();
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
  const before = await page.locator('#following-card').boundingBox();
  await page.locator('aviadilo-map details.weather > summary').click();
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
