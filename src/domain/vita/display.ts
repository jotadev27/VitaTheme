/**
 * PS Vita display geometry.
 *
 * The panel is 960x544, but theme wallpapers are authored at 960x512: the top 32 pixels
 * are occupied by the system information bar, which is coloured through the theme rather
 * than supplied as an image.
 */
export const VITA_SCREEN_WIDTH = 960;
export const VITA_SCREEN_HEIGHT = 544;
export const VITA_INFORMATION_BAR_HEIGHT = 32;
export const VITA_WALLPAPER_WIDTH = VITA_SCREEN_WIDTH;
export const VITA_WALLPAPER_HEIGHT = VITA_SCREEN_HEIGHT - VITA_INFORMATION_BAR_HEIGHT;
