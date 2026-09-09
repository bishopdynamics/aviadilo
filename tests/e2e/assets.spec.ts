import { expect, test } from '@playwright/test';
import type { RuntimeApi } from '../../dev/runtime';
import type { AviadiloMap } from '../../src/aviadilo-map';
declare global {
  interface Window {
    aviadiloTest: RuntimeApi;
  }
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
});
test('live, preview and raw picker share transport and assets; edits preserve viewport and clients', async ({
  page,
}) => {
  await page.goto('/runtime.html');
  await expect(
    page.locator('aviadilo-map .leaflet-tile img').first(),
  ).toBeVisible();
  await page.evaluate(() => {
    window.aviadiloTest.move(0, 34.1, -117.72, 9);
    const first = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.add(first.config);
    const second = document.querySelectorAll('aviadilo-map')[1] as AviadiloMap;
    second.preview = true;
  });
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().subscriptions))
    .toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => window.aviadiloTest.stats().assetSubscriptions),
    )
    .toBe(1);
  const messages = await page.evaluate(() => window.aviadiloTest.stats().calls);
  expect(
    messages.filter((message) => message.type === 'aviadilo/subscribe_assets'),
  ).toEqual([{ type: 'aviadilo/subscribe_assets', schema_version: 1 }]);
  expect(messages.some((message) => message.type === 'subscribe_events')).toBe(
    false,
  );
  const before = await page.evaluate(() => ({
    center: window.aviadiloTest.inspect(0).center,
    calls: window.aviadiloTest
      .stats()
      .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
    assets: window.aviadiloTest.stats().assets.length,
  }));
  await page.evaluate(() => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    card.preview = true;
    window.aviadiloTest.config(0, {
      title: 'Same real data',
      radar: { ...card.config.radar, opacity: 0.4 },
    });
  });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before.center);
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .calls.filter((c) => c.type === 'aviadilo/subscribe').length,
    ),
  ).toBe(before.calls);
  expect(
    await page.evaluate(() => window.aviadiloTest.stats().assetPeak),
  ).toBeLessThanOrEqual(8);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).assets?.bytes),
  ).toBeLessThanOrEqual(32 * 1024 * 1024);
  // A raw picker has ordinary mount semantics and real HA state.
  await page.evaluate(() => {
    const original = document.querySelector('aviadilo-map') as AviadiloMap;
    const picker = document.createElement('hui-card-picker');
    const card = document.createElement('aviadilo-map') as AviadiloMap;
    card.setConfig({
      ...original.config,
      layers: { aircraft: false, radar: false, wind: false, people: true },
    });
    card.hass = original.hass;
    picker.append(card);
    document.body.prepend(picker);
  });
  await expect(page.locator('hui-card-picker .person-marker')).toHaveCount(2);
  await expect(page.locator('hui-card-picker .reference-marker')).toHaveCount(
    1,
  );
  await expect(
    page.locator('hui-card-picker .leaflet-tile img').first(),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic · offline preview', { exact: true }),
  ).toHaveCount(0);
});
test('clear releases old decoded resources, failed assets stay honest, photos are private and initials survive failures', async ({
  page,
}) => {
  await page.goto('/runtime.html');
  await expect(
    page.locator('aviadilo-map .leaflet-tile img').first(),
  ).toBeVisible();
  await page.evaluate(() => {
    window.aviadiloTest.config(0, {
      people: {
        trackers: [{ entity_id: 'device_tracker.synthetic', show_photo: true }],
      },
    });
    window.aviadiloTest.photo(
      'device_tracker.synthetic',
      'https://photos.aviadilo.invalid/alex?private=secret',
    );
  });
  await expect(page.locator('.person-marker img')).toHaveCount(1);
  expect(await page.locator('.person-marker img').getAttribute('src')).toMatch(
    /^blob:/,
  );
  expect(
    await page.evaluate(
      () =>
        window.aviadiloTest
          .stats()
          .assets.filter((path) => path.includes('/photo?')).length,
    ),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.aviadiloTest.assets(0, true);
    window.aviadiloTest.clearAssets();
  });
  await expect(page.locator('.person-marker')).toHaveText('AL');
  await expect(page.locator('.person-marker img')).toHaveCount(0);
  await page.locator('.person-marker').click();
  await expect(page.locator('.leaflet-popup')).toContainText(
    'Asset source is unavailable',
  );
  expect(await page.locator('aviadilo-map').innerHTML()).not.toContain(
    'private=secret',
  );
  await page.evaluate(() => {
    window.aviadiloTest.assets();
    window.aviadiloTest.clearAssets();
  });
  await expect(
    page.locator('aviadilo-map .leaflet-tile img').first(),
  ).toBeVisible();
  await page.evaluate(() => window.aviadiloTest.detach(0));
  await expect
    .poll(() =>
      page.evaluate(() => window.aviadiloTest.stats().assetSubscriptions),
    )
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.stats().assetActive))
    .toBe(0);
});
test('existing missing integration card recovers basemap on passive discovery without pan', async ({
  page,
}) => {
  await page.goto('/runtime.html');
  await page.evaluate(() => {
    window.aviadiloTest.detach(0);
    window.aviadiloTest.unavailable(true);
    window.aviadiloTest.attach(0);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector('aviadilo-map') as unknown as {
          integration?: { entry_id?: string };
          discovering: boolean;
        };
        return {
          entry: card.integration?.entry_id ?? null,
          discovering: card.discovering,
          assets: window.aviadiloTest.stats().assetSubscriptions,
        };
      }),
    )
    .toEqual({ entry: null, discovering: false, assets: 0 });
  await expect(page.locator('aviadilo-map .leaflet-tile img')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => !!window.aviadiloTest.inspect(0).center))
    .toBe(true);
  const before = await page.evaluate(
    () => window.aviadiloTest.inspect(0).center,
  );
  await page.evaluate(() => window.aviadiloTest.unavailable(false));
  await expect(
    page.locator('aviadilo-map .leaflet-tile img').first(),
  ).toBeVisible({ timeout: 12000 });
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).center),
  ).toEqual(before);
});

test('extremely wide zoom-zero views group world copies without changing map zoom', async ({
  page,
}) => {
  await page.goto('/runtime.html');
  await page.evaluate(async () => {
    const card = document.querySelector('aviadilo-map') as AviadiloMap;
    window.aviadiloTest.config(0, {
      layers: { aircraft: false, radar: false, wind: false, people: false },
      map: { min_zoom: 0, max_zoom: 22, height_px: 160 },
    });
    await card.updateComplete;
    window.aviadiloTest.move(0, 0, 0, 0);
    card.style.width = '25000px';
  });
  await expect(
    page.locator('.leaflet-tile[style*="background-image"]').first(),
  ).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => window.aviadiloTest.inspect(0).zoom))
    .toBe(0);
  expect(await page.locator('.leaflet-tile').count()).toBeLessThanOrEqual(96);
  expect(
    await page.evaluate(() => window.aviadiloTest.inspect(0).assets?.bytes),
  ).toBeLessThanOrEqual(32 * 1024 * 1024);
  // Rebuild cached Leaflet grid geometry when the grouping factor changes.
  await page.evaluate(() => {
    (document.querySelector('aviadilo-map') as HTMLElement).style.width =
      '900px';
  });
  await expect(page.locator('.leaflet-tile img').first()).toBeAttached();
  await expect(
    page.locator('.leaflet-tile[style*="background-image"]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.aviadiloTest.inspect(0).zoom)).toBe(
    0,
  );
});
