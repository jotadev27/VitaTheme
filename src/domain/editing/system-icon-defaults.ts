import type { ThemeProject } from '../model/theme-project';
import { allHomeAppSlots, type HomeAppSlotId } from '../vita/home-app-slots';

/**
 * What a system icon slot shows when the theme does not replace it.
 *
 * A theme replaces the icons it names in `theme.xml` and says nothing about the rest, and
 * the console draws its own artwork for those — so an empty slot is not a gap in the theme,
 * it is a decision: *leave this one alone*. That is why taking an icon out of a theme is
 * called restoring the default rather than clearing it, and why the editor draws something
 * in the slot instead of a blank square.
 *
 * **What it draws is VitaTheme's own.** The console's icons are Sony's artwork and are not
 * in this repository, so the stand-in is a neutral mark drawn by this application. It exists
 * to show that the slot is *not* themed, and is never written into a theme: exporting it
 * would replace the console's icon with a picture nobody asked for. The export carries the
 * icons the author actually chose, and nothing else.
 */

export type SystemIconSource =
  /** The theme does not replace this icon; the console draws its own. */
  | 'default'
  /** The theme supplies an icon for this slot. */
  | 'themed';

export const systemIconSource = (project: ThemeProject, slot: HomeAppSlotId): SystemIconSource =>
  project.home.appIcons.has(slot) ? 'themed' : 'default';

/** The slots this theme replaces, in the format layer's order. */
export const themedSystemIcons = (project: ThemeProject): readonly HomeAppSlotId[] =>
  allHomeAppSlots()
    .map((slot) => slot.id)
    .filter((id) => systemIconSource(project, id) === 'themed');

export const hasThemedSystemIcons = (project: ThemeProject): boolean =>
  themedSystemIcons(project).length > 0;
