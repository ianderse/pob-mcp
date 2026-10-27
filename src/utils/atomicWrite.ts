import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/** Commit a complete file; a failed write never truncates the previous version. */
export async function atomicWriteFile(filePath: string, content: string, overwrite: boolean): Promise<void> {
  const temporary = path.join(path.dirname(filePath), `.pob-write-${randomUUID()}.tmp`);
  try {
    let mode: number | undefined;
    try { mode = (await fs.stat(filePath)).mode; } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
    const file = await fs.open(temporary, 'wx', mode);
    try {
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally { await file.close(); }
    if (overwrite) {
      await fs.rename(temporary, filePath);
    } else {
      // Unlike access()+writeFile(), link() cannot overwrite a file created meanwhile.
      await fs.link(temporary, filePath);
    }
  } finally {
    await fs.unlink(temporary).catch((error: any) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
