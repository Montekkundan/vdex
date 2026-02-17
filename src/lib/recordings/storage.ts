import { promises as fs } from "node:fs";
import path from "node:path";

function getStorageRoot(): string {
  if (process.env.RECORDINGS_STORAGE_DIR?.trim()) {
    return process.env.RECORDINGS_STORAGE_DIR;
  }
  return path.join(process.cwd(), ".recordings");
}

function resolveStoragePath(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  return path.join(getStorageRoot(), normalized);
}

export async function putRecordingObject(key: string, bytes: Uint8Array): Promise<number> {
  const target = resolveStoragePath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return bytes.byteLength;
}

export async function getRecordingObject(key: string): Promise<Buffer | null> {
  const target = resolveStoragePath(key);
  try {
    return await fs.readFile(target);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    throw err;
  }
}

export async function statRecordingObject(
  key: string,
): Promise<{ size: number; mtime: Date } | null> {
  const target = resolveStoragePath(key);
  try {
    const stats = await fs.stat(target);
    return { size: stats.size, mtime: stats.mtime };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteRecordingObject(key: string): Promise<void> {
  const target = resolveStoragePath(key);
  try {
    await fs.rm(target, { force: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
  }
}

export async function deleteRecordingPrefix(prefix: string): Promise<void> {
  const target = resolveStoragePath(prefix);
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
  }
}
