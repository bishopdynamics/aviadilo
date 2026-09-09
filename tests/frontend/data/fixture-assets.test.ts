import { expect, it, vi } from 'vitest';
import { fixtureBlob } from '../../../dev/fixtures';
it('aborted fixture image encoding finishes the HTTP request before a late encoder callback', async () => {
  let callback!: BlobCallback;
  const canvas = {
    width: 256,
    height: 256,
    toBlob: vi.fn((value: BlobCallback) => {
      callback = value;
    }),
  };
  const controller = new AbortController();
  let active = 1;
  const response = fixtureBlob(
    canvas as unknown as HTMLCanvasElement,
    controller.signal,
  ).finally(() => {
    active--;
  });
  controller.abort();
  await expect(response).rejects.toMatchObject({ name: 'AbortError' });
  expect(active).toBe(0);
  expect(canvas.width).toBe(0);
  expect(canvas.height).toBe(0);
  callback(new Blob(['late png']));
  await Promise.resolve();
  expect(active).toBe(0);
});
it('fixture encoding handles already-canceled and successful requests with buffer cleanup', async () => {
  const canvas = {
    width: 256,
    height: 256,
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png']))),
  };
  const controller = new AbortController();
  controller.abort();
  await expect(
    fixtureBlob(canvas as unknown as HTMLCanvasElement, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(canvas.toBlob).not.toHaveBeenCalled();
  await expect(
    fixtureBlob(canvas as unknown as HTMLCanvasElement),
  ).resolves.toBeInstanceOf(Blob);
  expect(canvas.width).toBe(0);
});
