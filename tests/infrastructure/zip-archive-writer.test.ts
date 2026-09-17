import { describe, expect, it } from 'vitest';
import { crc32 } from '@/infrastructure/archive/crc32';
import { createZipArchiveWriter } from '@/infrastructure/archive/zip-archive-writer';
import type { Result } from '@/domain/shared/result';
import {
  readZipArchive,
  zipEntry,
  zipEntryNames,
  zipEntryText,
  ZIP_METHOD_DEFLATED,
  ZIP_METHOD_STORED,
} from '../support/zip-reader';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

interface CollectedArchive {
  readonly bytes: Uint8Array;
  readonly writes: number;
}

const collect = (): {
  sink: (bytes: Uint8Array) => Promise<void>;
  archive: () => CollectedArchive;
} => {
  const blocks: Uint8Array[] = [];

  return {
    sink: (bytes) => {
      blocks.push(Uint8Array.from(bytes));
      return Promise.resolve();
    },
    archive: () => {
      const bytes = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
      let offset = 0;
      for (const block of blocks) {
        bytes.set(block, offset);
        offset += block.length;
      }
      return { bytes, writes: blocks.length };
    },
  };
};

const expectAccepted = (result: Result<void, { code: string; message: string }>): void => {
  if (!result.ok) {
    throw new Error(`Expected the entry to be accepted, but it failed: ${result.error.message}`);
  }
};

const archiveOf = async (
  entries: readonly (readonly [string, Uint8Array])[],
): Promise<Uint8Array> => {
  const { sink, archive } = collect();
  const writer = createZipArchiveWriter(sink);

  for (const [name, contents] of entries) {
    expectAccepted(await writer.addFile(name, contents));
  }
  expectAccepted(await writer.finish());

  return archive().bytes;
};

describe('createZipArchiveWriter', () => {
  it('writes an archive that reads back with the entries it was given', async () => {
    const bytes = await archiveOf([
      ['theme.xml', text('<theme />')],
      ['bg1.png', text('background')],
    ]);

    const archive = readZipArchive(bytes);

    expect(zipEntryNames(archive)).toEqual(['theme.xml', 'bg1.png']);
    expect(zipEntryText(archive, 'theme.xml')).toBe('<theme />');
    expect(zipEntryText(archive, 'bg1.png')).toBe('background');
  });

  it('keeps entries in the order they were added', async () => {
    const archive = readZipArchive(
      await archiveOf([
        ['theme.xml', text('a')],
        ['icons/music.png', text('b')],
        ['bg1.png', text('c')],
      ]),
    );

    expect(zipEntryNames(archive)).toEqual(['theme.xml', 'icons/music.png', 'bg1.png']);
  });

  it('round-trips bytes that are not text', async () => {
    const binary = Uint8Array.from({ length: 512 }, (_, index) => (index * 7) % 256);
    const archive = readZipArchive(await archiveOf([['bg1.png', binary]]));

    expect(zipEntry(archive, 'bg1.png').contents).toEqual(binary);
  });

  it('records the checksum of the original bytes', async () => {
    const contents = text('background music');
    const archive = readZipArchive(await archiveOf([['BGM.at9', contents]]));

    expect(zipEntry(archive, 'BGM.at9').crc32).toBe(crc32(contents));
  });

  it('compresses what compresses, and stores what does not', async () => {
    const repetitive = text('vita'.repeat(2000));
    const incompressible = Uint8Array.from({ length: 64 }, (_, index) => (index * 251) % 256);

    const archive = readZipArchive(
      await archiveOf([
        ['bg1.png', repetitive],
        ['icon.png', incompressible],
      ]),
    );

    const compressed = zipEntry(archive, 'bg1.png');
    expect(compressed.compressionMethod).toBe(ZIP_METHOD_DEFLATED);
    expect(compressed.compressedSize).toBeLessThan(compressed.uncompressedSize);

    // PNG and ATRAC9 are already compressed; deflating them again only adds bytes.
    const stored = zipEntry(archive, 'icon.png');
    expect(stored.compressionMethod).toBe(ZIP_METHOD_STORED);
    expect(stored.compressedSize).toBe(stored.uncompressedSize);
  });

  it('stores an empty file rather than growing it', async () => {
    const archive = readZipArchive(await archiveOf([['empty.png', new Uint8Array()]]));

    expect(zipEntry(archive, 'empty.png')).toMatchObject({
      compressionMethod: ZIP_METHOD_STORED,
      compressedSize: 0,
      uncompressedSize: 0,
      crc32: 0,
    });
  });

  it('marks entry names as UTF-8 so a theme can be named in any language', async () => {
    const archive = readZipArchive(await archiveOf([['背景.png', text('a')]]));

    expect(zipEntryNames(archive)).toEqual(['背景.png']);
    expect(zipEntry(archive, '背景.png').flags & 0x0800).toBe(0x0800);
  });

  it('claims no file permissions, so the archive cannot describe a link or a program', async () => {
    const entry = zipEntry(readZipArchive(await archiveOf([['bg1.png', text('a')]])), 'bg1.png');

    expect(entry.externalAttributes).toBe(0);
    // Upper byte 0 is MS-DOS, whose attributes have no file-type or permission bits.
    expect(entry.versionMadeBy >> 8).toBe(0);
  });

  it('writes the same archive byte for byte every time', async () => {
    const entries = [
      ['theme.xml', text('<theme />')],
      ['bg1.png', text('background')],
    ] as const;

    expect(await archiveOf(entries)).toEqual(await archiveOf(entries));
  });

  it('timestamps every entry identically, so an archive says nothing about when it was built', async () => {
    const archive = readZipArchive(
      await archiveOf([
        ['theme.xml', text('a')],
        ['bg1.png', text('b')],
      ]),
    );

    // 1 January 1980: the earliest an MS-DOS timestamp can express.
    for (const entry of archive.entries) {
      expect(entry.dosDate).toBe(0x0021);
      expect(entry.dosTime).toBe(0);
    }
  });

  it('writes a valid archive when the theme has no files at all', async () => {
    const { sink, archive } = collect();
    const writer = createZipArchiveWriter(sink);
    expectAccepted(await writer.finish());

    expect(readZipArchive(archive().bytes).entries).toEqual([]);
  });

  it('hands the archive to the sink as it goes rather than building it in memory', async () => {
    const { sink, archive } = collect();
    const writer = createZipArchiveWriter(sink);

    expectAccepted(await writer.addFile('bg1.png', text('background')));
    expect(archive().writes).toBeGreaterThan(0);
  });

  describe('names it refuses', () => {
    it.each([
      ['../escape.png', 'a path that climbs out of the archive'],
      ['../../etc/passwd', 'a path that climbs out several times'],
      ['/absolute.png', 'an absolute path'],
      ['icons\\music.png', 'a Windows separator, which some tools read as a folder'],
      ['C:/theme/bg1.png', 'a drive letter'],
      ['nested/../bg1.png', 'traversal in the middle of a path'],
      ['', 'an empty name'],
      ['icons//music.png', 'an empty folder name'],
      ['CON.png', 'a name Windows reserves for a device'],
      ['icons /music.png', 'a folder name ending in a space, which Windows cannot create'],
      ['music.png.', 'a name ending in a dot, which Windows silently drops'],
    ])('refuses %j — %s', async (name) => {
      const writer = createZipArchiveWriter(collect().sink);

      const added = await writer.addFile(name, text('payload'));

      expect(added.ok).toBe(false);
      if (!added.ok) {
        expect(added.error.code).toBe('unsafe-path');
      }
    });

    it('refuses a name it has already written, which would hide one of the two files', async () => {
      const writer = createZipArchiveWriter(collect().sink);
      expectAccepted(await writer.addFile('bg1.png', text('first')));

      const second = await writer.addFile('bg1.png', text('second'));

      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.code).toBe('duplicate-path');
      }
    });

    it('stores a name under the form it validated, not as it was given', async () => {
      // The domain trims a path before checking it, so the archive holds the trimmed name —
      // the same name the manifest refers to the file by.
      const archive = readZipArchive(await archiveOf([['  bg1.png  ', text('background')]]));

      expect(zipEntryNames(archive)).toEqual(['bg1.png']);
    });

    it('does not write anything for an entry it refused', async () => {
      const { sink, archive } = collect();
      const writer = createZipArchiveWriter(sink);

      await writer.addFile('../escape.png', text('payload'));
      expectAccepted(await writer.finish());

      expect(readZipArchive(archive().bytes).entries).toEqual([]);
    });
  });

  it('lets a failure in the sink reach the caller rather than writing a broken archive', async () => {
    const writer = createZipArchiveWriter(() => Promise.reject(new Error('disk full')));

    await expect(writer.addFile('bg1.png', text('background'))).rejects.toThrow('disk full');
  });
});
