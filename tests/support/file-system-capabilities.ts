import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Windows file symlinks need Developer Mode or privileges. Directory junctions do not.
export const canCreateFileSymlinks = ((): boolean => {
  const root = mkdtempSync(join(tmpdir(), 'vitatheme-link-probe-'));
  try {
    writeFileSync(join(root, 'target'), 'probe');
    symlinkSync(join(root, 'target'), join(root, 'link'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
})();

export const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';
