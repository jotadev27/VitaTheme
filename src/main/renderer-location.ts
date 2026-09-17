/** A packaged app must load the renderer from its own archive, regardless of its environment. */
export const developmentRendererUrl = (
  packaged: boolean,
  configuredUrl: string | undefined,
): string | undefined => (packaged ? undefined : configuredUrl);
