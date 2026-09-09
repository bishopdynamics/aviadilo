/** Compatibility boundary checked against HA 2026.9.1 and its frontend APIs.
 * HA's subscribeMessage resolves to an unsubscribe function, never an ID.
 * We disable its automatic replay so reconnect uses the client's latest state.
 */
import { parseAssetPath } from './assets';
export type Unsubscribe = () => Promise<void>;
export type WireMessage = { type: string; [key: string]: unknown };
export type ConnectionEvent = 'ready' | 'disconnected' | 'reconnect-error';

export interface HaConnection {
  connected: boolean;
  subscribeMessage<T>(
    callback: (event: T) => void,
    message: WireMessage,
    options: { resubscribe: boolean },
  ): Promise<Unsubscribe>;
  addEventListener(event: ConnectionEvent, callback: () => void): void;
  removeEventListener(event: ConnectionEvent, callback: () => void): void;
}

export interface HassTransport {
  user?: { id: string };
  connection: HaConnection;
  callWS<T>(message: WireMessage): Promise<T>;
  fetchWithAuth(path: string, init?: RequestInit): Promise<Response>;
}

export interface HaAdapter {
  readonly connected: boolean;
  call(message: WireMessage): Promise<unknown>;
  subscribe(
    message: WireMessage,
    event: (value: unknown) => void,
  ): Promise<Unsubscribe>;
  fetch(path: string, signal: AbortSignal): Promise<Response>;
  listen(changed: () => void): () => void;
}

export function createHaAdapter(
  source: HassTransport | (() => HassTransport),
): HaAdapter {
  const current = typeof source === 'function' ? source : () => source;
  const connection = current().connection;
  const userId = current().user?.id;
  const latest = () => {
    const hass = current();
    if (hass.connection !== connection || hass.user?.id !== userId)
      throw new Error('HA connection changed');
    return hass;
  };
  return {
    get connected() {
      return connection.connected;
    },
    call: (message) => latest().callWS(message),
    subscribe: (message, event) =>
      connection.subscribeMessage(event, message, { resubscribe: false }),
    fetch: (path, signal) => {
      // Exact raw route only: URL normalization must never turn an unsafe path
      // into an allowed one. Radar's opaque query values remain untouched.
      const radar = /^\/api\/aviadilo\/radar\?[^#\\\r\n]*(?![\s\S])/.test(path);
      if (!radar) parseAssetPath(path);
      return latest().fetchWithAuth(path, {
        signal,
        credentials: 'same-origin',
        redirect: 'error',
        ...(!radar ? { referrerPolicy: 'origin' as const } : {}),
      });
    },
    listen: (changed) => {
      const events: ConnectionEvent[] = [
        'ready',
        'disconnected',
        'reconnect-error',
      ];
      events.forEach((event) => connection.addEventListener(event, changed));
      return () =>
        events.forEach((event) =>
          connection.removeEventListener(event, changed),
        );
    },
  };
}
