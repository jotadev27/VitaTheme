import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@/ipc';
import {
  parseDroppedAssetRequest,
  parseGeneratePreviewsRequest,
  parseRecentProjectRequest,
  parseConvertAssetRequest,
  parseBulkImageConversionRequest,
  MAX_METADATA_INPUT_LENGTH,
  parseExportRequest,
  parseStartDraftRequest,
  parseThemeAssetPathRequest,
  parseThemeAssetSlot,
  parseThemeEdit,
} from '@/main/ipc/requests';

/**
 * The window is the least trusted part of the application. These are the checks that stand
 * between what it says and what the privileged process does about it.
 */

describe('parseStartDraftRequest', () => {
  it('accepts a name and an author', () => {
    const parsed = parseStartDraftRequest({ title: 'Midnight', provider: 'Someone' });

    expect(parsed.ok && parsed.value).toEqual({ title: 'Midnight', provider: 'Someone' });
  });

  it('trims what it is given', () => {
    const parsed = parseStartDraftRequest({ title: '  Midnight  ', provider: ' Someone ' });

    expect(parsed.ok && parsed.value).toEqual({ title: 'Midnight', provider: 'Someone' });
  });

  it('allows an empty name, which the validator is the one to complain about', () => {
    const parsed = parseStartDraftRequest({ title: '', provider: '' });

    expect(parsed.ok).toBe(true);
  });

  it.each([
    [undefined, 'nothing at all'],
    [null, 'null'],
    ['Midnight', 'a bare string'],
    [42, 'a number'],
    [[{ title: 'Midnight', provider: '' }], 'an array'],
    [{ title: 'Midnight' }, 'a missing field'],
    [{ title: 'Midnight', provider: 7 }, 'a field of the wrong type'],
    [{ title: { toString: 'no' }, provider: '' }, 'an object where text belongs'],
  ])('refuses %j — %s', (payload: unknown, _description: string) => {
    expect(parseStartDraftRequest(payload).ok).toBe(false);
  });

  it('refuses text longer than a theme could sensibly carry', () => {
    const request = { title: 'a'.repeat(MAX_METADATA_INPUT_LENGTH + 1), provider: '' };

    expect(parseStartDraftRequest(request).ok).toBe(false);
  });

  it('explains itself without repeating what it was sent', () => {
    const parsed = parseStartDraftRequest({ title: 'a'.repeat(5000), provider: '' });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).not.toContain('aaaa');
  });
});

describe('parseExportRequest', () => {
  it.each(['folder', 'archive'])('accepts the %s format', (format) => {
    expect(parseExportRequest({ format }).ok).toBe(true);
  });

  it.each([
    [{ format: 'pkg' }, 'a format this application does not write'],
    [{ format: 'FOLDER' }, 'a format in the wrong case'],
    [{}, 'no format'],
    [{ format: ['folder'] }, 'a format that is not a string'],
    ['folder', 'a bare string'],
    [null, 'null'],
  ])('refuses %j — %s', (payload: unknown, _description: string) => {
    expect(parseExportRequest(payload).ok).toBe(false);
  });
});

describe('parseBulkImageConversionRequest', () => {
  it('allows only non-stretch fit and strips any attempted filesystem location', () => {
    expect(
      parseBulkImageConversionRequest({ fit: 'cover', path: '/private/home/secret.jpg' }),
    ).toEqual({
      ok: true,
      value: { fit: 'cover' },
    });
    expect(parseBulkImageConversionRequest({ fit: 'stretch' }).ok).toBe(false);
    expect(parseBulkImageConversionRequest({ fit: 'contain' }).ok).toBe(true);
  });
});

describe('parseThemeAssetSlot', () => {
  it.each([
    { kind: 'liveAreaBackground', page: 0 },
    { kind: 'liveAreaThumbnail', page: 9 },
    { kind: 'appIcon', application: 'hostCollabo' },
    { kind: 'basePageIndicator' },
    { kind: 'backgroundMusic' },
    { kind: 'packageThumbnail' },
  ])('accepts %j', (slot) => {
    expect(parseThemeAssetSlot(slot).ok).toBe(true);
  });

  it('keeps only what the slot is made of', () => {
    const parsed = parseThemeAssetSlot({
      kind: 'appIcon',
      application: 'browser',
      somethingElse: 'ignored',
    });

    expect(parsed.ok && parsed.value).toEqual({ kind: 'appIcon', application: 'browser' });
  });

  it.each([
    [{ kind: 'liveAreaBackground', page: 10 }, 'a page beyond the ten the console has'],
    [{ kind: 'liveAreaBackground', page: -1 }, 'a page before the first'],
    [{ kind: 'liveAreaBackground', page: 1.5 }, 'a page that is not a whole number'],
    [{ kind: 'liveAreaBackground', page: '0' }, 'a page given as text'],
    [{ kind: 'liveAreaBackground' }, 'no page at all'],
    [{ kind: 'appIcon', application: 'store' }, 'an application a theme cannot replace'],
    [{ kind: 'appIcon' }, 'no application'],
    [{ kind: 'somewhereElse' }, 'a slot that does not exist'],
    [{ kind: '__proto__' }, 'a name from the prototype chain'],
    [{ kind: 'toString' }, 'a name every object has'],
    ['basePageIndicator', 'a bare string'],
    [null, 'null'],
    [[{ kind: 'basePageIndicator' }], 'an array'],
  ])('refuses %j — %s', (payload: unknown, _description: string) => {
    expect(parseThemeAssetSlot(payload).ok).toBe(false);
  });
});

describe('parseThemeEdit', () => {
  it.each([
    { kind: 'set-localized-default', field: 'title', value: 'Midnight' },
    { kind: 'set-translation', field: 'provider', language: 'fr', value: 'Quelquun' },
    { kind: 'set-translation', field: 'title', language: 'fr', value: null },
    { kind: 'set-content-version', value: '01.00' },
    { kind: 'set-color', slot: { kind: 'barColor' }, value: 'FF202020' },
    { kind: 'set-color', slot: { kind: 'bubbleFont', page: 2 }, value: null },
    { kind: 'set-wave-type', page: 0, value: 24 },
    { kind: 'set-wave-type', page: 0, value: null },
    { kind: 'set-bubble-shadow', page: 0, value: false },
    { kind: 'set-date-layout', value: 2 },
    { kind: 'add-page' },
    { kind: 'remove-page', page: 3 },
    { kind: 'move-page', page: 3, to: 0 },
    { kind: 'clear-asset', slot: { kind: 'startScreenBackground' } },
    { kind: 'restore-system-icons' },
  ])('accepts %j', (edit) => {
    expect(parseThemeEdit(edit).ok).toBe(true);
  });

  it('takes nothing from a change that takes nothing', () => {
    // Extra fields are ignored rather than refused, as everywhere else in this contract:
    // what comes out is the change, and nothing the window attached to it.
    const parsed = parseThemeEdit({ kind: 'restore-system-icons', slot: { kind: 'nowhere' } });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toEqual({ kind: 'restore-system-icons' });
  });

  it.each([
    [
      { kind: 'set-localized-default', field: 'nickname', value: 'x' },
      'a field a theme has not got',
    ],
    [{ kind: 'set-localized-default', field: 'title' }, 'no value'],
    [{ kind: 'set-localized-default', field: 'title', value: 42 }, 'a value that is not text'],
    [{ kind: 'set-translation', field: 'title', language: 'fr' }, 'no value and no removal'],
    [
      { kind: 'set-color', slot: { kind: 'unknownColour' }, value: '000000' },
      'a colour a theme has not got',
    ],
    [
      { kind: 'set-color', slot: { kind: 'bubbleFont', page: 99 }, value: '000000' },
      'a page out of range',
    ],
    [{ kind: 'set-wave-type', page: 0, value: '24' }, 'a number given as text'],
    [{ kind: 'set-wave-type', page: 0, value: Number.MAX_VALUE }, 'a number beyond what is safe'],
    [{ kind: 'set-bubble-shadow', page: 0, value: 'on' }, 'a flag given as text'],
    [{ kind: 'set-date-layout', value: 1.5 }, 'a position that is not whole'],
    [{ kind: 'move-page', page: 0 }, 'nowhere to move to'],
    [{ kind: 'clear-asset', slot: { kind: 'nowhere' } }, 'a slot that does not exist'],
    [{ kind: 'drop-database' }, 'a change this application does not make'],

    [{ kind: '__proto__' }, 'a name from the prototype chain'],
    [{}, 'no kind at all'],
    ['add-page', 'a bare string'],
    [null, 'null'],
    [['add-page'], 'an array'],
  ])('refuses %j — %s', (payload: unknown, _description: string) => {
    expect(parseThemeEdit(payload).ok).toBe(false);
  });

  it('refuses text longer than a theme could sensibly carry', () => {
    const edit = {
      kind: 'set-localized-default',
      field: 'title',
      value: 'a'.repeat(MAX_METADATA_INPUT_LENGTH + 1),
    };

    expect(parseThemeEdit(edit).ok).toBe(false);
  });

  it('never repeats what it was sent back at whoever sent it', () => {
    const parsed = parseThemeEdit({ kind: 'set-content-version', value: 'x'.repeat(5000) });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).not.toContain('xxxx');
  });
});

describe('parseThemeAssetPathRequest', () => {
  it('accepts a file a theme could hold', () => {
    const parsed = parseThemeAssetPathRequest({ path: 'icons/browser.png' });

    expect(parsed.ok && parsed.value).toBe('icons/browser.png');
  });

  it.each([
    ['../../etc/passwd', 'a path climbing out of the theme'],
    ['/etc/passwd', 'an absolute path'],
    ['C:/Windows/system32/config/sam', 'a drive letter'],
    ['icons\\browser.png', 'a Windows separator'],
    ['nested/../bg1.png', 'traversal in the middle'],
    ['CON.png', 'a name Windows resolves to a device'],
    ['', 'nothing'],
  ])('refuses %j — %s', (path: string, _description: string) => {
    expect(parseThemeAssetPathRequest({ path }).ok).toBe(false);
  });

  it.each([
    [{}, 'no path'],
    [{ path: 7 }, 'a path that is not text'],
    [null, 'null'],
  ])('refuses %j — %s', (payload: unknown, _description: string) => {
    expect(parseThemeAssetPathRequest(payload).ok).toBe(false);
  });
});

describe('the operations that take arguments, and the ones that do not', () => {
  it('leaves undo and redo nothing to get wrong', () => {
    // They carry no arguments at all, so there is no payload to check and none to abuse.
    expect(IPC_CHANNELS.undo).toBe('vitatheme:theme:undo');
    expect(IPC_CHANNELS.redo).toBe('vitatheme:theme:redo');
  });
});

describe('asking for a picture to be converted', () => {
  it('accepts a slot and a way of fitting a picture into it', () => {
    const parsed = parseConvertAssetRequest({
      slot: { kind: 'liveAreaBackground', page: 2 },
      fit: 'contain',
    });

    expect(parsed).toEqual({
      ok: true,
      value: { slot: { kind: 'liveAreaBackground', page: 2 }, fit: 'contain' },
    });
  });

  it.each([
    ['a slot that is not one', { slot: { kind: 'somewhere-else' }, fit: 'cover' }],
    ['no slot at all', { fit: 'cover' }],
    ['a fit that is not one', { slot: { kind: 'basePageIndicator' }, fit: 'squeeze' }],
    ['no fit at all', { slot: { kind: 'basePageIndicator' } }],
    ['a fit that is not text', { slot: { kind: 'basePageIndicator' }, fit: 3 }],
    ['nothing at all', null],
  ])('refuses %s', (_case, payload) => {
    expect(parseConvertAssetRequest(payload).ok).toBe(false);
  });

  it('refuses a request carrying a path, because a conversion never names one', () => {
    const parsed = parseConvertAssetRequest({
      slot: { kind: 'basePageIndicator' },
      fit: 'cover',
      destination: '/tmp/somewhere-else.png',
    });

    // The extra field is not read: what comes back is the slot and the fit, and nothing else.
    expect(parsed).toEqual({
      ok: true,
      value: { slot: { kind: 'basePageIndicator' }, fit: 'cover' },
    });
  });
});

describe('naming a project the window was offered', () => {
  it('accepts an identifier this application assigns', () => {
    expect(parseRecentProjectRequest({ id: 'aaaa1111bbbb2222' })).toEqual({
      ok: true,
      value: { id: 'aaaa1111bbbb2222' },
    });
  });

  it.each([
    ['an identifier that is not one', { id: 'my-project' }],
    ['a prototype name', { id: '__proto__' }],
    ['a path', { id: '../../projects/Other.vitatheme' }],
    ['an identifier that is too short to be one', { id: 'aaa' }],
    ['no identifier at all', {}],
    ['something that is not text', { id: 7 }],
    ['nothing at all', null],
  ])('refuses %s', (_case, payload) => {
    expect(parseRecentProjectRequest(payload).ok).toBe(false);
  });
});

describe('a file dragged onto a slot', () => {
  it('accepts a slot and the location the drop produced', () => {
    const parsed = parseDroppedAssetRequest({
      slot: { kind: 'liveAreaBackground', page: 1 },
      path: '/artwork/pictures/wallpaper.png',
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        slot: { kind: 'liveAreaBackground', page: 1 },
        path: '/artwork/pictures/wallpaper.png',
      },
    });
  });

  it.each([
    ['a slot that is not one', { slot: { kind: 'elsewhere' }, path: '/a/b.png' }],
    ['no slot', { path: '/a/b.png' }],
    ['no path', { slot: { kind: 'basePageIndicator' } }],
    ['an empty path', { slot: { kind: 'basePageIndicator' }, path: '' }],
    ['a path that is not text', { slot: { kind: 'basePageIndicator' }, path: 12 }],
    [
      'a path with a control character in it',
      { slot: { kind: 'basePageIndicator' }, path: `/a/b${String.fromCharCode(0)}.png` },
    ],
    [
      'a path longer than any filesystem would produce',
      { slot: { kind: 'basePageIndicator' }, path: `/${'a'.repeat(5000)}.png` },
    ],
  ])('refuses %s', (_case, payload) => {
    expect(parseDroppedAssetRequest(payload).ok).toBe(false);
  });

  it('reads only the slot and the path, whatever else the request carries', () => {
    const parsed = parseDroppedAssetRequest({
      slot: { kind: 'basePageIndicator' },
      path: '/a/b.png',
      destination: '/somewhere/else.png',
      overwrite: true,
    });

    expect(parsed).toEqual({
      ok: true,
      value: { slot: { kind: 'basePageIndicator' }, path: '/a/b.png' },
    });
  });

  it('leaves whether the path leads anywhere to the code that opens it', () => {
    // A path that climbs is still only a string here; it is resolved, confined and refused
    // where files are actually opened, which is the same place a chosen file goes.
    const parsed = parseDroppedAssetRequest({
      slot: { kind: 'basePageIndicator' },
      path: '/a/../../etc/shadow',
    });

    expect(parsed.ok).toBe(true);
  });
});

describe('asking for previews to be drawn', () => {
  it('reads the previews the window named', () => {
    const parsed = parseGeneratePreviewsRequest({
      kinds: ['packageThumbnail', 'homePreview'],
    });

    // In the format layer's order, so what is drawn does not depend on how it was asked for.
    expect(parsed).toEqual({ ok: true, value: { kinds: ['homePreview', 'packageThumbnail'] } });
  });

  it('accepts one on its own', () => {
    expect(parseGeneratePreviewsRequest({ kinds: ['startScreenPreview'] })).toEqual({
      ok: true,
      value: { kinds: ['startScreenPreview'] },
    });
  });

  it('names each preview once, however many times the window did', () => {
    const parsed = parseGeneratePreviewsRequest({
      kinds: ['homePreview', 'homePreview', 'homePreview'],
    });

    expect(parsed).toEqual({ ok: true, value: { kinds: ['homePreview'] } });
  });

  it.each([
    ['nothing at all', undefined],
    ['a request that is not one', 'homePreview'],
    ['an empty list', { kinds: [] }],
    ['something that is not a list', { kinds: 'homePreview' }],
    ['a name no theme has', { kinds: ['homePreview', 'liveAreaBackground'] }],
    ['something that is not a name', { kinds: [{ kind: 'homePreview' }] }],
    ['more entries than there are previews', { kinds: ['a', 'b', 'c', 'd'] }],
  ])('refuses %s', (_case, payload) => {
    expect(parseGeneratePreviewsRequest(payload).ok).toBe(false);
  });
});
