import { BRIDGE_KEY, type VitaThemeBridge } from '@/ipc';

/**
 * Reaching the privileged side of the application.
 *
 * The bridge is the only thing the window can call that has any effect outside the page, and
 * it is published by the preload script. If it is missing, the interface is running somewhere
 * it was not built for and there is nothing useful it can do, so it says so rather than
 * failing one action at a time.
 */
declare global {
  interface Window {
    readonly [BRIDGE_KEY]?: VitaThemeBridge;
  }
}

export const appBridge = (): VitaThemeBridge => {
  const bridge = window[BRIDGE_KEY];

  if (bridge === undefined) {
    throw new Error(
      'VitaTheme is running without its application bridge. Start it with "pnpm run dev".',
    );
  }

  return bridge;
};
