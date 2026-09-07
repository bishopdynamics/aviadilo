/** Compatibility boundary checked against HA 2026.9.1 and its frontend APIs.
 * HA's subscribeMessage resolves to an unsubscribe function, never an ID.
 * We disable its automatic replay so reconnect uses the client's latest state.
 */
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

export function createHaAdapter(hass: HassTransport): HaAdapter {
  return {
    get connected() {
      return hass.connection.connected;
    },
    call: (message) => hass.callWS(message),
    subscribe: (message, event) =>
      hass.connection.subscribeMessage(event, message, { resubscribe: false }),
    fetch: (path, signal) => {
      if (!path.startsWith('/api/aviadilo/radar?'))
        throw new Error('Unexpected Aviadilo resource path');
      return hass.fetchWithAuth(path, {
        signal,
        credentials: 'same-origin',
        redirect: 'error',
      });
    },
    listen: (changed) => {
      const events: ConnectionEvent[] = [
        'ready',
        'disconnected',
        'reconnect-error',
      ];
      events.forEach((event) =>
        hass.connection.addEventListener(event, changed),
      );
      return () =>
        events.forEach((event) =>
          hass.connection.removeEventListener(event, changed),
        );
    },
  };
}
