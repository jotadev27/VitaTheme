/**
 * The system applications whose home-screen icons a theme may replace.
 *
 * Icons for games, the PlayStation Store and user-installed applications are supplied by
 * the applications themselves and cannot be themed.
 *
 * `xmlTag` is the element name used by the console's theme parser and is fixed by the
 * format; it is deliberately kept next to the slot so the two can never drift apart.
 */
export interface HomeAppSlot {
  readonly id: HomeAppSlotId;
  readonly xmlTag: string;
  readonly label: string;
}

export const HOME_APP_SLOT_IDS = [
  'browser',
  'calendar',
  'camera',
  'email',
  'friend',
  'hostCollabo',
  'message',
  'music',
  'near',
  'parental',
  'party',
  'power',
  'ps3Link',
  'ps4Link',
  'settings',
  'trophy',
  'video',
] as const;

export type HomeAppSlotId = (typeof HOME_APP_SLOT_IDS)[number];

const SLOTS: Readonly<Record<HomeAppSlotId, HomeAppSlot>> = {
  browser: { id: 'browser', xmlTag: 'm_browser', label: 'Browser' },
  calendar: { id: 'calendar', xmlTag: 'm_calendar', label: 'Calendar' },
  camera: { id: 'camera', xmlTag: 'm_camera', label: 'Photos' },
  email: { id: 'email', xmlTag: 'm_email', label: 'Email' },
  friend: { id: 'friend', xmlTag: 'm_friend', label: 'Friends' },
  hostCollabo: { id: 'hostCollabo', xmlTag: 'm_hostCollabo', label: 'Content Manager' },
  message: { id: 'message', xmlTag: 'm_message', label: 'Messages' },
  music: { id: 'music', xmlTag: 'm_music', label: 'Music' },
  near: { id: 'near', xmlTag: 'm_near', label: 'Near' },
  parental: { id: 'parental', xmlTag: 'm_parental', label: 'Parental Controls' },
  party: { id: 'party', xmlTag: 'm_party', label: 'Party' },
  power: { id: 'power', xmlTag: 'm_power', label: 'Power' },
  ps3Link: { id: 'ps3Link', xmlTag: 'm_ps3Link', label: 'PS3 Link' },
  ps4Link: { id: 'ps4Link', xmlTag: 'm_ps4Link', label: 'PS4 Link' },
  settings: { id: 'settings', xmlTag: 'm_settings', label: 'Settings' },
  trophy: { id: 'trophy', xmlTag: 'm_trophy', label: 'Trophies' },
  video: { id: 'video', xmlTag: 'm_video', label: 'Video' },
};

export const homeAppSlot = (id: HomeAppSlotId): HomeAppSlot => SLOTS[id];

export const allHomeAppSlots = (): readonly HomeAppSlot[] => HOME_APP_SLOT_IDS.map(homeAppSlot);
