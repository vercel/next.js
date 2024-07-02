/* eslint-disable */
// @ts-nocheck

import fs from 'fs';
import { URL as URL$1, fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { createHash } from 'crypto';
import { EOL } from 'os';
import esmModule, { createRequire, isBuiltin } from 'module';
import assert from 'assert';

const SAFE_TIME = 456789e3;

const PortablePath = {
  root: `/`,
  dot: `.`,
  parent: `..`
};
const npath = Object.create(path);
const ppath = Object.create(path.posix);
npath.cwd = () => process.cwd();
ppath.cwd = process.platform === `win32` ? () => toPortablePath(process.cwd()) : process.cwd;
if (process.platform === `win32`) {
  ppath.resolve = (...segments) => {
    if (segments.length > 0 && ppath.isAbsolute(segments[0])) {
      return path.posix.resolve(...segments);
    } else {
      return path.posix.resolve(ppath.cwd(), ...segments);
    }
  };
}
const contains = function(pathUtils, from, to) {
  from = pathUtils.normalize(from);
  to = pathUtils.normalize(to);
  if (from === to)
    return `.`;
  if (!from.endsWith(pathUtils.sep))
    from = from + pathUtils.sep;
  if (to.startsWith(from)) {
    return to.slice(from.length);
  } else {
    return null;
  }
};
npath.contains = (from, to) => contains(npath, from, to);
ppath.contains = (from, to) => contains(ppath, from, to);
const WINDOWS_PATH_REGEXP = /^([a-zA-Z]:.*)$/;
const UNC_WINDOWS_PATH_REGEXP = /^\/\/(\.\/)?(.*)$/;
const PORTABLE_PATH_REGEXP = /^\/([a-zA-Z]:.*)$/;
const UNC_PORTABLE_PATH_REGEXP = /^\/unc\/(\.dot\/)?(.*)$/;
function fromPortablePathWin32(p) {
  let portablePathMatch, uncPortablePathMatch;
  if (portablePathMatch = p.match(PORTABLE_PATH_REGEXP))
    p = portablePathMatch[1];
  else if (uncPortablePathMatch = p.match(UNC_PORTABLE_PATH_REGEXP))
    p = `\\\\${uncPortablePathMatch[1] ? `.\\` : ``}${uncPortablePathMatch[2]}`;
  else
    return p;
  return p.replace(/\//g, `\\`);
}
function toPortablePathWin32(p) {
  p = p.replace(/\\/g, `/`);
  let windowsPathMatch, uncWindowsPathMatch;
  if (windowsPathMatch = p.match(WINDOWS_PATH_REGEXP))
    p = `/${windowsPathMatch[1]}`;
  else if (uncWindowsPathMatch = p.match(UNC_WINDOWS_PATH_REGEXP))
    p = `/unc/${uncWindowsPathMatch[1] ? `.dot/` : ``}${uncWindowsPathMatch[2]}`;
  return p;
}
const toPortablePath = process.platform === `win32` ? toPortablePathWin32 : (p) => p;
const fromPortablePath = process.platform === `win32` ? fromPortablePathWin32 : (p) => p;
npath.fromPortablePath = fromPortablePath;
npath.toPortablePath = toPortablePath;
function convertPath(targetPathUtils, sourcePath) {
  return targetPathUtils === npath ? fromPortablePath(sourcePath) : toPortablePath(sourcePath);
}

const defaultTime = new Date(SAFE_TIME * 1e3);
const defaultTimeMs = defaultTime.getTime();
async function copyPromise(destinationFs, destination, sourceFs, source, opts) {
  const normalizedDestination = destinationFs.pathUtils.normalize(destination);
  const normalizedSource = sourceFs.pathUtils.normalize(source);
  const prelayout = [];
  const postlayout = [];
  const { atime, mtime } = opts.stableTime ? { atime: defaultTime, mtime: defaultTime } : await sourceFs.lstatPromise(normalizedSource);
  await destinationFs.mkdirpPromise(destinationFs.pathUtils.dirname(destination), { utimes: [atime, mtime] });
  await copyImpl(prelayout, postlayout, destinationFs, normalizedDestination, sourceFs, normalizedSource, { ...opts, didParentExist: true });
  for (const operation of prelayout)
    await operation();
  await Promise.all(postlayout.map((operation) => {
    return operation();
  }));
}
async function copyImpl(prelayout, postlayout, destinationFs, destination, sourceFs, source, opts) {
  const destinationStat = opts.didParentExist ? await maybeLStat(destinationFs, destination) : null;
  const sourceStat = await sourceFs.lstatPromise(source);
  const { atime, mtime } = opts.stableTime ? { atime: defaultTime, mtime: defaultTime } : sourceStat;
  let updated;
  switch (true) {
    case sourceStat.isDirectory():
      {
        updated = await copyFolder(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts);
      }
      break;
    case sourceStat.isFile():
      {
        updated = await copyFile(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts);
      }
      break;
    case sourceStat.isSymbolicLink():
      {
        updated = await copySymlink(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts);
      }
      break;
    default: {
      throw new Error(`Unsupported file type (${sourceStat.mode})`);
    }
  }
  if (opts.linkStrategy?.type !== `HardlinkFromIndex` || !sourceStat.isFile()) {
    if (updated || destinationStat?.mtime?.getTime() !== mtime.getTime() || destinationStat?.atime?.getTime() !== atime.getTime()) {
      postlayout.push(() => destinationFs.lutimesPromise(destination, atime, mtime));
      updated = true;
    }
    if (destinationStat === null || (destinationStat.mode & 511) !== (sourceStat.mode & 511)) {
      postlayout.push(() => destinationFs.chmodPromise(destination, sourceStat.mode & 511));
      updated = true;
    }
  }
  return updated;
}
async function maybeLStat(baseFs, p) {
  try {
    return await baseFs.lstatPromise(p);
  } catch (e) {
    return null;
  }
}
async function copyFolder(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts) {
  if (destinationStat !== null && !destinationStat.isDirectory()) {
    if (opts.overwrite) {
      prelayout.push(async () => destinationFs.removePromise(destination));
      destinationStat = null;
    } else {
      return false;
    }
  }
  let updated = false;
  if (destinationStat === null) {
    prelayout.push(async () => {
      try {
        await destinationFs.mkdirPromise(destination, { mode: sourceStat.mode });
      } catch (err) {
        if (err.code !== `EEXIST`) {
          throw err;
        }
      }
    });
    updated = true;
  }
  const entries = await sourceFs.readdirPromise(source);
  const nextOpts = opts.didParentExist && !destinationStat ? { ...opts, didParentExist: false } : opts;
  if (opts.stableSort) {
    for (const entry of entries.sort()) {
      if (await copyImpl(prelayout, postlayout, destinationFs, destinationFs.pathUtils.join(destination, entry), sourceFs, sourceFs.pathUtils.join(source, entry), nextOpts)) {
        updated = true;
      }
    }
  } else {
    const entriesUpdateStatus = await Promise.all(entries.map(async (entry) => {
      await copyImpl(prelayout, postlayout, destinationFs, destinationFs.pathUtils.join(destination, entry), sourceFs, sourceFs.pathUtils.join(source, entry), nextOpts);
    }));
    if (entriesUpdateStatus.some((status) => status)) {
      updated = true;
    }
  }
  return updated;
}
async function copyFileViaIndex(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts, linkStrategy) {
  const sourceHash = await sourceFs.checksumFilePromise(source, { algorithm: `sha1` });
  const defaultMode = 420;
  const sourceMode = sourceStat.mode & 511;
  const indexFileName = `${sourceHash}${sourceMode !== defaultMode ? sourceMode.toString(8) : ``}`;
  const indexPath = destinationFs.pathUtils.join(linkStrategy.indexPath, sourceHash.slice(0, 2), `${indexFileName}.dat`);
  let AtomicBehavior;
  ((AtomicBehavior2) => {
    AtomicBehavior2[AtomicBehavior2["Lock"] = 0] = "Lock";
    AtomicBehavior2[AtomicBehavior2["Rename"] = 1] = "Rename";
  })(AtomicBehavior || (AtomicBehavior = {}));
  let atomicBehavior = 1 /* Rename */;
  let indexStat = await maybeLStat(destinationFs, indexPath);
  if (destinationStat) {
    const isDestinationHardlinkedFromIndex = indexStat && destinationStat.dev === indexStat.dev && destinationStat.ino === indexStat.ino;
    const isIndexModified = indexStat?.mtimeMs !== defaultTimeMs;
    if (isDestinationHardlinkedFromIndex) {
      if (isIndexModified && linkStrategy.autoRepair) {
        atomicBehavior = 0 /* Lock */;
        indexStat = null;
      }
    }
    if (!isDestinationHardlinkedFromIndex) {
      if (opts.overwrite) {
        prelayout.push(async () => destinationFs.removePromise(destination));
        destinationStat = null;
      } else {
        return false;
      }
    }
  }
  const tempPath = !indexStat && atomicBehavior === 1 /* Rename */ ? `${indexPath}.${Math.floor(Math.random() * 4294967296).toString(16).padStart(8, `0`)}` : null;
  let tempPathCleaned = false;
  prelayout.push(async () => {
    if (!indexStat) {
      if (atomicBehavior === 0 /* Lock */) {
        await destinationFs.lockPromise(indexPath, async () => {
          const content = await sourceFs.readFilePromise(source);
          await destinationFs.writeFilePromise(indexPath, content);
        });
      }
      if (atomicBehavior === 1 /* Rename */ && tempPath) {
        const content = await sourceFs.readFilePromise(source);
        await destinationFs.writeFilePromise(tempPath, content);
        try {
          await destinationFs.linkPromise(tempPath, indexPath);
        } catch (err) {
          if (err.code === `EEXIST`) {
            tempPathCleaned = true;
            await destinationFs.unlinkPromise(tempPath);
          } else {
            throw err;
          }
        }
      }
    }
    if (!destinationStat) {
      await destinationFs.linkPromise(indexPath, destination);
    }
  });
  postlayout.push(async () => {
    if (!indexStat) {
      await destinationFs.lutimesPromise(indexPath, defaultTime, defaultTime);
      if (sourceMode !== defaultMode) {
        await destinationFs.chmodPromise(indexPath, sourceMode);
      }
    }
    if (tempPath && !tempPathCleaned) {
      await destinationFs.unlinkPromise(tempPath);
    }
  });
  return false;
}
async function copyFileDirect(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts) {
  if (destinationStat !== null) {
    if (opts.overwrite) {
      prelayout.push(async () => destinationFs.removePromise(destination));
      destinationStat = null;
    } else {
      return false;
    }
  }
  prelayout.push(async () => {
    const content = await sourceFs.readFilePromise(source);
    await destinationFs.writeFilePromise(destination, content);
  });
  return true;
}
async function copyFile(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts) {
  if (opts.linkStrategy?.type === `HardlinkFromIndex`) {
    return copyFileViaIndex(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts, opts.linkStrategy);
  } else {
    return copyFileDirect(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts);
  }
}
async function copySymlink(prelayout, postlayout, destinationFs, destination, destinationStat, sourceFs, source, sourceStat, opts) {
  if (destinationStat !== null) {
    if (opts.overwrite) {
      prelayout.push(async () => destinationFs.removePromise(destination));
      destinationStat = null;
    } else {
      return false;
    }
  }
  prelayout.push(async () => {
    await destinationFs.symlinkPromise(convertPath(destinationFs.pathUtils, await sourceFs.readlinkPromise(source)), destination);
  });
  return true;
}

class FakeFS {
  constructor(pathUtils) {
    this.pathUtils = pathUtils;
  }
  async *genTraversePromise(init, { stableSort = false } = {}) {
    const stack = [init];
    while (stack.length > 0) {
      const p = stack.shift();
      const entry = await this.lstatPromise(p);
      if (entry.isDirectory()) {
        const entries = await this.readdirPromise(p);
        if (stableSort) {
          for (const entry2 of entries.sort()) {
            stack.push(this.pathUtils.join(p, entry2));
          }
        } else {
          throw new Error(`Not supported`);
        }
      } else {
        yield p;
      }
    }
  }
  async checksumFilePromise(path, { algorithm = `sha512` } = {}) {
    const fd = await this.openPromise(path, `r`);
    try {
      const CHUNK_SIZE = 65536;
      const chunk = Buffer.allocUnsafeSlow(CHUNK_SIZE);
      const hash = createHash(algorithm);
      let bytesRead = 0;
      while ((bytesRead = await this.readPromise(fd, chunk, 0, CHUNK_SIZE)) !== 0)
        hash.update(bytesRead === CHUNK_SIZE ? chunk : chunk.slice(0, bytesRead));
      return hash.digest(`hex`);
    } finally {
      await this.closePromise(fd);
    }
  }
  async removePromise(p, { recursive = true, maxRetries = 5 } = {}) {
    let stat;
    try {
      stat = await this.lstatPromise(p);
    } catch (error) {
      if (error.code === `ENOENT`) {
        return;
      } else {
        throw error;
      }
    }
    if (stat.isDirectory()) {
      if (recursive) {
        const entries = await this.readdirPromise(p);
        await Promise.all(entries.map((entry) => {
          return this.removePromise(this.pathUtils.resolve(p, entry));
        }));
      }
      for (let t = 0; t <= maxRetries; t++) {
        try {
          await this.rmdirPromise(p);
          break;
        } catch (error) {
          if (error.code !== `EBUSY` && error.code !== `ENOTEMPTY`) {
            throw error;
          } else if (t < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, t * 100));
          }
        }
      }
    } else {
      await this.unlinkPromise(p);
    }
  }
  removeSync(p, { recursive = true } = {}) {
    let stat;
    try {
      stat = this.lstatSync(p);
    } catch (error) {
      if (error.code === `ENOENT`) {
        return;
      } else {
        throw error;
      }
    }
    if (stat.isDirectory()) {
      if (recursive)
        for (const entry of this.readdirSync(p))
          this.removeSync(this.pathUtils.resolve(p, entry));
      this.rmdirSync(p);
    } else {
      this.unlinkSync(p);
    }
  }
  async mkdirpPromise(p, { chmod, utimes } = {}) {
    p = this.resolve(p);
    if (p === this.pathUtils.dirname(p))
      return void 0;
    const parts = p.split(this.pathUtils.sep);
    let createdDirectory;
    for (let u = 2; u <= parts.length; ++u) {
      const subPath = parts.slice(0, u).join(this.pathUtils.sep);
      if (!this.existsSync(subPath)) {
        try {
          await this.mkdirPromise(subPath);
        } catch (error) {
          if (error.code === `EEXIST`) {
            continue;
          } else {
            throw error;
          }
        }
        createdDirectory ??= subPath;
        if (chmod != null)
          await this.chmodPromise(subPath, chmod);
        if (utimes != null) {
          await this.utimesPromise(subPath, utimes[0], utimes[1]);
        } else {
          const parentStat = await this.statPromise(this.pathUtils.dirname(subPath));
          await this.utimesPromise(subPath, parentStat.atime, parentStat.mtime);
        }
      }
    }
    return createdDirectory;
  }
  mkdirpSync(p, { chmod, utimes } = {}) {
    p = this.resolve(p);
    if (p === this.pathUtils.dirname(p))
      return void 0;
    const parts = p.split(this.pathUtils.sep);
    let createdDirectory;
    for (let u = 2; u <= parts.length; ++u) {
      const subPath = parts.slice(0, u).join(this.pathUtils.sep);
      if (!this.existsSync(subPath)) {
        try {
          this.mkdirSync(subPath);
        } catch (error) {
          if (error.code === `EEXIST`) {
            continue;
          } else {
            throw error;
          }
        }
        createdDirectory ??= subPath;
        if (chmod != null)
          this.chmodSync(subPath, chmod);
        if (utimes != null) {
          this.utimesSync(subPath, utimes[0], utimes[1]);
        } else {
          const parentStat = this.statSync(this.pathUtils.dirname(subPath));
          this.utimesSync(subPath, parentStat.atime, parentStat.mtime);
        }
      }
    }
    return createdDirectory;
  }
  async copyPromise(destination, source, { baseFs = this, overwrite = true, stableSort = false, stableTime = false, linkStrategy = null } = {}) {
    return await copyPromise(this, destination, baseFs, source, { overwrite, stableSort, stableTime, linkStrategy });
  }
  copySync(destination, source, { baseFs = this, overwrite = true } = {}) {
    const stat = baseFs.lstatSync(source);
    const exists = this.existsSync(destination);
    if (stat.isDirectory()) {
      this.mkdirpSync(destination);
      const directoryListing = baseFs.readdirSync(source);
      for (const entry of directoryListing) {
        this.copySync(this.pathUtils.join(destination, entry), baseFs.pathUtils.join(source, entry), { baseFs, overwrite });
      }
    } else if (stat.isFile()) {
      if (!exists || overwrite) {
        if (exists)
          this.removeSync(destination);
        const content = baseFs.readFileSync(source);
        this.writeFileSync(destination, content);
      }
    } else if (stat.isSymbolicLink()) {
      if (!exists || overwrite) {
        if (exists)
          this.removeSync(destination);
        const target = baseFs.readlinkSync(source);
        this.symlinkSync(convertPath(this.pathUtils, target), destination);
      }
    } else {
      throw new Error(`Unsupported file type (file: ${source}, mode: 0o${stat.mode.toString(8).padStart(6, `0`)})`);
    }
    const mode = stat.mode & 511;
    this.chmodSync(destination, mode);
  }
  async changeFilePromise(p, content, opts = {}) {
    if (Buffer.isBuffer(content)) {
      return this.changeFileBufferPromise(p, content, opts);
    } else {
      return this.changeFileTextPromise(p, content, opts);
    }
  }
  async changeFileBufferPromise(p, content, { mode } = {}) {
    let current = Buffer.alloc(0);
    try {
      current = await this.readFilePromise(p);
    } catch (error) {
    }
    if (Buffer.compare(current, content) === 0)
      return;
    await this.writeFilePromise(p, content, { mode });
  }
  async changeFileTextPromise(p, content, { automaticNewlines, mode } = {}) {
    let current = ``;
    try {
      current = await this.readFilePromise(p, `utf8`);
    } catch (error) {
    }
    const normalizedContent = automaticNewlines ? normalizeLineEndings(current, content) : content;
    if (current === normalizedContent)
      return;
    await this.writeFilePromise(p, normalizedContent, { mode });
  }
  changeFileSync(p, content, opts = {}) {
    if (Buffer.isBuffer(content)) {
      return this.changeFileBufferSync(p, content, opts);
    } else {
      return this.changeFileTextSync(p, content, opts);
    }
  }
  changeFileBufferSync(p, content, { mode } = {}) {
    let current = Buffer.alloc(0);
    try {
      current = this.readFileSync(p);
    } catch (error) {
    }
    if (Buffer.compare(current, content) === 0)
      return;
    this.writeFileSync(p, content, { mode });
  }
  changeFileTextSync(p, content, { automaticNewlines = false, mode } = {}) {
    let current = ``;
    try {
      current = this.readFileSync(p, `utf8`);
    } catch (error) {
    }
    const normalizedContent = automaticNewlines ? normalizeLineEndings(current, content) : content;
    if (current === normalizedContent)
      return;
    this.writeFileSync(p, normalizedContent, { mode });
  }
  async movePromise(fromP, toP) {
    try {
      await this.renamePromise(fromP, toP);
    } catch (error) {
      if (error.code === `EXDEV`) {
        await this.copyPromise(toP, fromP);
        await this.removePromise(fromP);
      } else {
        throw error;
      }
    }
  }
  moveSync(fromP, toP) {
    try {
      this.renameSync(fromP, toP);
    } catch (error) {
      if (error.code === `EXDEV`) {
        this.copySync(toP, fromP);
        this.removeSync(fromP);
      } else {
        throw error;
      }
    }
  }
  async lockPromise(affectedPath, callback) {
    const lockPath = `${affectedPath}.flock`;
    const interval = 1e3 / 60;
    const startTime = Date.now();
    let fd = null;
    const isAlive = async () => {
      let pid;
      try {
        [pid] = await this.readJsonPromise(lockPath);
      } catch (error) {
        return Date.now() - startTime < 500;
      }
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return false;
      }
    };
    while (fd === null) {
      try {
        fd = await this.openPromise(lockPath, `wx`);
      } catch (error) {
        if (error.code === `EEXIST`) {
          if (!await isAlive()) {
            try {
              await this.unlinkPromise(lockPath);
              continue;
            } catch (error2) {
            }
          }
          if (Date.now() - startTime < 60 * 1e3) {
            await new Promise((resolve) => setTimeout(resolve, interval));
          } else {
            throw new Error(`Couldn't acquire a lock in a reasonable time (via ${lockPath})`);
          }
        } else {
          throw error;
        }
      }
    }
    await this.writePromise(fd, JSON.stringify([process.pid]));
    try {
      return await callback();
    } finally {
      try {
        await this.closePromise(fd);
        await this.unlinkPromise(lockPath);
      } catch (error) {
      }
    }
  }
  async readJsonPromise(p) {
    const content = await this.readFilePromise(p, `utf8`);
    try {
      return JSON.parse(content);
    } catch (error) {
      error.message += ` (in ${p})`;
      throw error;
    }
  }
  readJsonSync(p) {
    const content = this.readFileSync(p, `utf8`);
    try {
      return JSON.parse(content);
    } catch (error) {
      error.message += ` (in ${p})`;
      throw error;
    }
  }
  async writeJsonPromise(p, data, { compact = false } = {}) {
    const space = compact ? 0 : 2;
    return await this.writeFilePromise(p, `${JSON.stringify(data, null, space)}
`);
  }
  writeJsonSync(p, data, { compact = false } = {}) {
    const space = compact ? 0 : 2;
    return this.writeFileSync(p, `${JSON.stringify(data, null, space)}
`);
  }
  async preserveTimePromise(p, cb) {
    const stat = await this.lstatPromise(p);
    const result = await cb();
    if (typeof result !== `undefined`)
      p = result;
    await this.lutimesPromise(p, stat.atime, stat.mtime);
  }
  async preserveTimeSync(p, cb) {
    const stat = this.lstatSync(p);
    const result = cb();
    if (typeof result !== `undefined`)
      p = result;
    this.lutimesSync(p, stat.atime, stat.mtime);
  }
}
class BasePortableFakeFS extends FakeFS {
  constructor() {
    super(ppath);
  }
}
function getEndOfLine(content) {
  const matches = content.match(/\r?\n/g);
  if (matches === null)
    return EOL;
  const crlf = matches.filter((nl) => nl === `\r
`).length;
  const lf = matches.length - crlf;
  return crlf > lf ? `\r
` : `
`;
}
function normalizeLineEndings(originalContent, newContent) {
  return newContent.replace(/\r?\n/g, getEndOfLine(originalContent));
}

class ProxiedFS extends FakeFS {
  getExtractHint(hints) {
    return this.baseFs.getExtractHint(hints);
  }
  resolve(path) {
    return this.mapFromBase(this.baseFs.resolve(this.mapToBase(path)));
  }
  getRealPath() {
    return this.mapFromBase(this.baseFs.getRealPath());
  }
  async openPromise(p, flags, mode) {
    return this.baseFs.openPromise(this.mapToBase(p), flags, mode);
  }
  openSync(p, flags, mode) {
    return this.baseFs.openSync(this.mapToBase(p), flags, mode);
  }
  async opendirPromise(p, opts) {
    return Object.assign(await this.baseFs.opendirPromise(this.mapToBase(p), opts), { path: p });
  }
  opendirSync(p, opts) {
    return Object.assign(this.baseFs.opendirSync(this.mapToBase(p), opts), { path: p });
  }
  async readPromise(fd, buffer, offset, length, position) {
    return await this.baseFs.readPromise(fd, buffer, offset, length, position);
  }
  readSync(fd, buffer, offset, length, position) {
    return this.baseFs.readSync(fd, buffer, offset, length, position);
  }
  async writePromise(fd, buffer, offset, length, position) {
    if (typeof buffer === `string`) {
      return await this.baseFs.writePromise(fd, buffer, offset);
    } else {
      return await this.baseFs.writePromise(fd, buffer, offset, length, position);
    }
  }
  writeSync(fd, buffer, offset, length, position) {
    if (typeof buffer === `string`) {
      return this.baseFs.writeSync(fd, buffer, offset);
    } else {
      return this.baseFs.writeSync(fd, buffer, offset, length, position);
    }
  }
  async closePromise(fd) {
    return this.baseFs.closePromise(fd);
  }
  closeSync(fd) {
    this.baseFs.closeSync(fd);
  }
  createReadStream(p, opts) {
    return this.baseFs.createReadStream(p !== null ? this.mapToBase(p) : p, opts);
  }
  createWriteStream(p, opts) {
    return this.baseFs.createWriteStream(p !== null ? this.mapToBase(p) : p, opts);
  }
  async realpathPromise(p) {
    return this.mapFromBase(await this.baseFs.realpathPromise(this.mapToBase(p)));
  }
  realpathSync(p) {
    return this.mapFromBase(this.baseFs.realpathSync(this.mapToBase(p)));
  }
  async existsPromise(p) {
    return this.baseFs.existsPromise(this.mapToBase(p));
  }
  existsSync(p) {
    return this.baseFs.existsSync(this.mapToBase(p));
  }
  accessSync(p, mode) {
    return this.baseFs.accessSync(this.mapToBase(p), mode);
  }
  async accessPromise(p, mode) {
    return this.baseFs.accessPromise(this.mapToBase(p), mode);
  }
  async statPromise(p, opts) {
    return this.baseFs.statPromise(this.mapToBase(p), opts);
  }
  statSync(p, opts) {
    return this.baseFs.statSync(this.mapToBase(p), opts);
  }
  async fstatPromise(fd, opts) {
    return this.baseFs.fstatPromise(fd, opts);
  }
  fstatSync(fd, opts) {
    return this.baseFs.fstatSync(fd, opts);
  }
  lstatPromise(p, opts) {
    return this.baseFs.lstatPromise(this.mapToBase(p), opts);
  }
  lstatSync(p, opts) {
    return this.baseFs.lstatSync(this.mapToBase(p), opts);
  }
  async fchmodPromise(fd, mask) {
    return this.baseFs.fchmodPromise(fd, mask);
  }
  fchmodSync(fd, mask) {
    return this.baseFs.fchmodSync(fd, mask);
  }
  async chmodPromise(p, mask) {
    return this.baseFs.chmodPromise(this.mapToBase(p), mask);
  }
  chmodSync(p, mask) {
    return this.baseFs.chmodSync(this.mapToBase(p), mask);
  }
  async fchownPromise(fd, uid, gid) {
    return this.baseFs.fchownPromise(fd, uid, gid);
  }
  fchownSync(fd, uid, gid) {
    return this.baseFs.fchownSync(fd, uid, gid);
  }
  async chownPromise(p, uid, gid) {
    return this.baseFs.chownPromise(this.mapToBase(p), uid, gid);
  }
  chownSync(p, uid, gid) {
    return this.baseFs.chownSync(this.mapToBase(p), uid, gid);
  }
  async renamePromise(oldP, newP) {
    return this.baseFs.renamePromise(this.mapToBase(oldP), this.mapToBase(newP));
  }
  renameSync(oldP, newP) {
    return this.baseFs.renameSync(this.mapToBase(oldP), this.mapToBase(newP));
  }
  async copyFilePromise(sourceP, destP, flags = 0) {
    return this.baseFs.copyFilePromise(this.mapToBase(sourceP), this.mapToBase(destP), flags);
  }
  copyFileSync(sourceP, destP, flags = 0) {
    return this.baseFs.copyFileSync(this.mapToBase(sourceP), this.mapToBase(destP), flags);
  }
  async appendFilePromise(p, content, opts) {
    return this.baseFs.appendFilePromise(this.fsMapToBase(p), content, opts);
  }
  appendFileSync(p, content, opts) {
    return this.baseFs.appendFileSync(this.fsMapToBase(p), content, opts);
  }
  async writeFilePromise(p, content, opts) {
    return this.baseFs.writeFilePromise(this.fsMapToBase(p), content, opts);
  }
  writeFileSync(p, content, opts) {
    return this.baseFs.writeFileSync(this.fsMapToBase(p), content, opts);
  }
  async unlinkPromise(p) {
    return this.baseFs.unlinkPromise(this.mapToBase(p));
  }
  unlinkSync(p) {
    return this.baseFs.unlinkSync(this.mapToBase(p));
  }
  async utimesPromise(p, atime, mtime) {
    return this.baseFs.utimesPromise(this.mapToBase(p), atime, mtime);
  }
  utimesSync(p, atime, mtime) {
    return this.baseFs.utimesSync(this.mapToBase(p), atime, mtime);
  }
  async lutimesPromise(p, atime, mtime) {
    return this.baseFs.lutimesPromise(this.mapToBase(p), atime, mtime);
  }
  lutimesSync(p, atime, mtime) {
    return this.baseFs.lutimesSync(this.mapToBase(p), atime, mtime);
  }
  async mkdirPromise(p, opts) {
    return this.baseFs.mkdirPromise(this.mapToBase(p), opts);
  }
  mkdirSync(p, opts) {
    return this.baseFs.mkdirSync(this.mapToBase(p), opts);
  }
  async rmdirPromise(p, opts) {
    return this.baseFs.rmdirPromise(this.mapToBase(p), opts);
  }
  rmdirSync(p, opts) {
    return this.baseFs.rmdirSync(this.mapToBase(p), opts);
  }
  async rmPromise(p, opts) {
    return this.baseFs.rmPromise(this.mapToBase(p), opts);
  }
  rmSync(p, opts) {
    return this.baseFs.rmSync(this.mapToBase(p), opts);
  }
  async linkPromise(existingP, newP) {
    return this.baseFs.linkPromise(this.mapToBase(existingP), this.mapToBase(newP));
  }
  linkSync(existingP, newP) {
    return this.baseFs.linkSync(this.mapToBase(existingP), this.mapToBase(newP));
  }
  async symlinkPromise(target, p, type) {
    const mappedP = this.mapToBase(p);
    if (this.pathUtils.isAbsolute(target))
      return this.baseFs.symlinkPromise(this.mapToBase(target), mappedP, type);
    const mappedAbsoluteTarget = this.mapToBase(this.pathUtils.join(this.pathUtils.dirname(p), target));
    const mappedTarget = this.baseFs.pathUtils.relative(this.baseFs.pathUtils.dirname(mappedP), mappedAbsoluteTarget);
    return this.baseFs.symlinkPromise(mappedTarget, mappedP, type);
  }
  symlinkSync(target, p, type) {
    const mappedP = this.mapToBase(p);
    if (this.pathUtils.isAbsolute(target))
      return this.baseFs.symlinkSync(this.mapToBase(target), mappedP, type);
    const mappedAbsoluteTarget = this.mapToBase(this.pathUtils.join(this.pathUtils.dirname(p), target));
    const mappedTarget = this.baseFs.pathUtils.relative(this.baseFs.pathUtils.dirname(mappedP), mappedAbsoluteTarget);
    return this.baseFs.symlinkSync(mappedTarget, mappedP, type);
  }
  async readFilePromise(p, encoding) {
    return this.baseFs.readFilePromise(this.fsMapToBase(p), encoding);
  }
  readFileSync(p, encoding) {
    return this.baseFs.readFileSync(this.fsMapToBase(p), encoding);
  }
  readdirPromise(p, opts) {
    return this.baseFs.readdirPromise(this.mapToBase(p), opts);
  }
  readdirSync(p, opts) {
    return this.baseFs.readdirSync(this.mapToBase(p), opts);
  }
  async readlinkPromise(p) {
    return this.mapFromBase(await this.baseFs.readlinkPromise(this.mapToBase(p)));
  }
  readlinkSync(p) {
    return this.mapFromBase(this.baseFs.readlinkSync(this.mapToBase(p)));
  }
  async truncatePromise(p, len) {
    return this.baseFs.truncatePromise(this.mapToBase(p), len);
  }
  truncateSync(p, len) {
    return this.baseFs.truncateSync(this.mapToBase(p), len);
  }
  async ftruncatePromise(fd, len) {
    return this.baseFs.ftruncatePromise(fd, len);
  }
  ftruncateSync(fd, len) {
    return this.baseFs.ftruncateSync(fd, len);
  }
  watch(p, a, b) {
    return this.baseFs.watch(
      this.mapToBase(p),
      a,
      b
    );
  }
  watchFile(p, a, b) {
    return this.baseFs.watchFile(
      this.mapToBase(p),
      a,
      b
    );
  }
  unwatchFile(p, cb) {
    return this.baseFs.unwatchFile(this.mapToBase(p), cb);
  }
  fsMapToBase(p) {
    if (typeof p === `number`) {
      return p;
    } else {
      return this.mapToBase(p);
    }
  }
}

function direntToPortable(dirent) {
  const portableDirent = dirent;
  if (typeof dirent.path === `string`)
    portableDirent.path = npath.toPortablePath(dirent.path);
  return portableDirent;
}
class NodeFS extends BasePortableFakeFS {
  constructor(realFs = fs) {
    super();
    this.realFs = realFs;
  }
  getExtractHint() {
    return false;
  }
  getRealPath() {
    return PortablePath.root;
  }
  resolve(p) {
    return ppath.resolve(p);
  }
  async openPromise(p, flags, mode) {
    return await new Promise((resolve, reject) => {
      this.realFs.open(npath.fromPortablePath(p), flags, mode, this.makeCallback(resolve, reject));
    });
  }
  openSync(p, flags, mode) {
    return this.realFs.openSync(npath.fromPortablePath(p), flags, mode);
  }
  async opendirPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (typeof opts !== `undefined`) {
        this.realFs.opendir(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.opendir(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    }).then((dir) => {
      const dirWithFixedPath = dir;
      Object.defineProperty(dirWithFixedPath, `path`, {
        value: p,
        configurable: true,
        writable: true
      });
      return dirWithFixedPath;
    });
  }
  opendirSync(p, opts) {
    const dir = typeof opts !== `undefined` ? this.realFs.opendirSync(npath.fromPortablePath(p), opts) : this.realFs.opendirSync(npath.fromPortablePath(p));
    const dirWithFixedPath = dir;
    Object.defineProperty(dirWithFixedPath, `path`, {
      value: p,
      configurable: true,
      writable: true
    });
    return dirWithFixedPath;
  }
  async readPromise(fd, buffer, offset = 0, length = 0, position = -1) {
    return await new Promise((resolve, reject) => {
      this.realFs.read(fd, buffer, offset, length, position, (error, bytesRead) => {
        if (error) {
          reject(error);
        } else {
          resolve(bytesRead);
        }
      });
    });
  }
  readSync(fd, buffer, offset, length, position) {
    return this.realFs.readSync(fd, buffer, offset, length, position);
  }
  async writePromise(fd, buffer, offset, length, position) {
    return await new Promise((resolve, reject) => {
      if (typeof buffer === `string`) {
        return this.realFs.write(fd, buffer, offset, this.makeCallback(resolve, reject));
      } else {
        return this.realFs.write(fd, buffer, offset, length, position, this.makeCallback(resolve, reject));
      }
    });
  }
  writeSync(fd, buffer, offset, length, position) {
    if (typeof buffer === `string`) {
      return this.realFs.writeSync(fd, buffer, offset);
    } else {
      return this.realFs.writeSync(fd, buffer, offset, length, position);
    }
  }
  async closePromise(fd) {
    await new Promise((resolve, reject) => {
      this.realFs.close(fd, this.makeCallback(resolve, reject));
    });
  }
  closeSync(fd) {
    this.realFs.closeSync(fd);
  }
  createReadStream(p, opts) {
    const realPath = p !== null ? npath.fromPortablePath(p) : p;
    return this.realFs.createReadStream(realPath, opts);
  }
  createWriteStream(p, opts) {
    const realPath = p !== null ? npath.fromPortablePath(p) : p;
    return this.realFs.createWriteStream(realPath, opts);
  }
  async realpathPromise(p) {
    return await new Promise((resolve, reject) => {
      this.realFs.realpath(npath.fromPortablePath(p), {}, this.makeCallback(resolve, reject));
    }).then((path) => {
      return npath.toPortablePath(path);
    });
  }
  realpathSync(p) {
    return npath.toPortablePath(this.realFs.realpathSync(npath.fromPortablePath(p), {}));
  }
  async existsPromise(p) {
    return await new Promise((resolve) => {
      this.realFs.exists(npath.fromPortablePath(p), resolve);
    });
  }
  accessSync(p, mode) {
    return this.realFs.accessSync(npath.fromPortablePath(p), mode);
  }
  async accessPromise(p, mode) {
    return await new Promise((resolve, reject) => {
      this.realFs.access(npath.fromPortablePath(p), mode, this.makeCallback(resolve, reject));
    });
  }
  existsSync(p) {
    return this.realFs.existsSync(npath.fromPortablePath(p));
  }
  async statPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        this.realFs.stat(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.stat(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    });
  }
  statSync(p, opts) {
    if (opts) {
      return this.realFs.statSync(npath.fromPortablePath(p), opts);
    } else {
      return this.realFs.statSync(npath.fromPortablePath(p));
    }
  }
  async fstatPromise(fd, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        this.realFs.fstat(fd, opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.fstat(fd, this.makeCallback(resolve, reject));
      }
    });
  }
  fstatSync(fd, opts) {
    if (opts) {
      return this.realFs.fstatSync(fd, opts);
    } else {
      return this.realFs.fstatSync(fd);
    }
  }
  async lstatPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        this.realFs.lstat(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.lstat(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    });
  }
  lstatSync(p, opts) {
    if (opts) {
      return this.realFs.lstatSync(npath.fromPortablePath(p), opts);
    } else {
      return this.realFs.lstatSync(npath.fromPortablePath(p));
    }
  }
  async fchmodPromise(fd, mask) {
    return await new Promise((resolve, reject) => {
      this.realFs.fchmod(fd, mask, this.makeCallback(resolve, reject));
    });
  }
  fchmodSync(fd, mask) {
    return this.realFs.fchmodSync(fd, mask);
  }
  async chmodPromise(p, mask) {
    return await new Promise((resolve, reject) => {
      this.realFs.chmod(npath.fromPortablePath(p), mask, this.makeCallback(resolve, reject));
    });
  }
  chmodSync(p, mask) {
    return this.realFs.chmodSync(npath.fromPortablePath(p), mask);
  }
  async fchownPromise(fd, uid, gid) {
    return await new Promise((resolve, reject) => {
      this.realFs.fchown(fd, uid, gid, this.makeCallback(resolve, reject));
    });
  }
  fchownSync(fd, uid, gid) {
    return this.realFs.fchownSync(fd, uid, gid);
  }
  async chownPromise(p, uid, gid) {
    return await new Promise((resolve, reject) => {
      this.realFs.chown(npath.fromPortablePath(p), uid, gid, this.makeCallback(resolve, reject));
    });
  }
  chownSync(p, uid, gid) {
    return this.realFs.chownSync(npath.fromPortablePath(p), uid, gid);
  }
  async renamePromise(oldP, newP) {
    return await new Promise((resolve, reject) => {
      this.realFs.rename(npath.fromPortablePath(oldP), npath.fromPortablePath(newP), this.makeCallback(resolve, reject));
    });
  }
  renameSync(oldP, newP) {
    return this.realFs.renameSync(npath.fromPortablePath(oldP), npath.fromPortablePath(newP));
  }
  async copyFilePromise(sourceP, destP, flags = 0) {
    return await new Promise((resolve, reject) => {
      this.realFs.copyFile(npath.fromPortablePath(sourceP), npath.fromPortablePath(destP), flags, this.makeCallback(resolve, reject));
    });
  }
  copyFileSync(sourceP, destP, flags = 0) {
    return this.realFs.copyFileSync(npath.fromPortablePath(sourceP), npath.fromPortablePath(destP), flags);
  }
  async appendFilePromise(p, content, opts) {
    return await new Promise((resolve, reject) => {
      const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
      if (opts) {
        this.realFs.appendFile(fsNativePath, content, opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.appendFile(fsNativePath, content, this.makeCallback(resolve, reject));
      }
    });
  }
  appendFileSync(p, content, opts) {
    const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
    if (opts) {
      this.realFs.appendFileSync(fsNativePath, content, opts);
    } else {
      this.realFs.appendFileSync(fsNativePath, content);
    }
  }
  async writeFilePromise(p, content, opts) {
    return await new Promise((resolve, reject) => {
      const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
      if (opts) {
        this.realFs.writeFile(fsNativePath, content, opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.writeFile(fsNativePath, content, this.makeCallback(resolve, reject));
      }
    });
  }
  writeFileSync(p, content, opts) {
    const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
    if (opts) {
      this.realFs.writeFileSync(fsNativePath, content, opts);
    } else {
      this.realFs.writeFileSync(fsNativePath, content);
    }
  }
  async unlinkPromise(p) {
    return await new Promise((resolve, reject) => {
      this.realFs.unlink(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
    });
  }
  unlinkSync(p) {
    return this.realFs.unlinkSync(npath.fromPortablePath(p));
  }
  async utimesPromise(p, atime, mtime) {
    return await new Promise((resolve, reject) => {
      this.realFs.utimes(npath.fromPortablePath(p), atime, mtime, this.makeCallback(resolve, reject));
    });
  }
  utimesSync(p, atime, mtime) {
    this.realFs.utimesSync(npath.fromPortablePath(p), atime, mtime);
  }
  async lutimesPromise(p, atime, mtime) {
    return await new Promise((resolve, reject) => {
      this.realFs.lutimes(npath.fromPortablePath(p), atime, mtime, this.makeCallback(resolve, reject));
    });
  }
  lutimesSync(p, atime, mtime) {
    this.realFs.lutimesSync(npath.fromPortablePath(p), atime, mtime);
  }
  async mkdirPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      this.realFs.mkdir(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
    });
  }
  mkdirSync(p, opts) {
    return this.realFs.mkdirSync(npath.fromPortablePath(p), opts);
  }
  async rmdirPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        this.realFs.rmdir(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.rmdir(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    });
  }
  rmdirSync(p, opts) {
    return this.realFs.rmdirSync(npath.fromPortablePath(p), opts);
  }
  async rmPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        this.realFs.rm(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
      } else {
        this.realFs.rm(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    });
  }
  rmSync(p, opts) {
    return this.realFs.rmSync(npath.fromPortablePath(p), opts);
  }
  async linkPromise(existingP, newP) {
    return await new Promise((resolve, reject) => {
      this.realFs.link(npath.fromPortablePath(existingP), npath.fromPortablePath(newP), this.makeCallback(resolve, reject));
    });
  }
  linkSync(existingP, newP) {
    return this.realFs.linkSync(npath.fromPortablePath(existingP), npath.fromPortablePath(newP));
  }
  async symlinkPromise(target, p, type) {
    return await new Promise((resolve, reject) => {
      this.realFs.symlink(npath.fromPortablePath(target.replace(/\/+$/, ``)), npath.fromPortablePath(p), type, this.makeCallback(resolve, reject));
    });
  }
  symlinkSync(target, p, type) {
    return this.realFs.symlinkSync(npath.fromPortablePath(target.replace(/\/+$/, ``)), npath.fromPortablePath(p), type);
  }
  async readFilePromise(p, encoding) {
    return await new Promise((resolve, reject) => {
      const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
      this.realFs.readFile(fsNativePath, encoding, this.makeCallback(resolve, reject));
    });
  }
  readFileSync(p, encoding) {
    const fsNativePath = typeof p === `string` ? npath.fromPortablePath(p) : p;
    return this.realFs.readFileSync(fsNativePath, encoding);
  }
  async readdirPromise(p, opts) {
    return await new Promise((resolve, reject) => {
      if (opts) {
        if (opts.recursive && process.platform === `win32`) {
          if (opts.withFileTypes) {
            this.realFs.readdir(npath.fromPortablePath(p), opts, this.makeCallback((results) => resolve(results.map(direntToPortable)), reject));
          } else {
            this.realFs.readdir(npath.fromPortablePath(p), opts, this.makeCallback((results) => resolve(results.map(npath.toPortablePath)), reject));
          }
        } else {
          this.realFs.readdir(npath.fromPortablePath(p), opts, this.makeCallback(resolve, reject));
        }
      } else {
        this.realFs.readdir(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
      }
    });
  }
  readdirSync(p, opts) {
    if (opts) {
      if (opts.recursive && process.platform === `win32`) {
        if (opts.withFileTypes) {
          return this.realFs.readdirSync(npath.fromPortablePath(p), opts).map(direntToPortable);
        } else {
          return this.realFs.readdirSync(npath.fromPortablePath(p), opts).map(npath.toPortablePath);
        }
      } else {
        return this.realFs.readdirSync(npath.fromPortablePath(p), opts);
      }
    } else {
      return this.realFs.readdirSync(npath.fromPortablePath(p));
    }
  }
  async readlinkPromise(p) {
    return await new Promise((resolve, reject) => {
      this.realFs.readlink(npath.fromPortablePath(p), this.makeCallback(resolve, reject));
    }).then((path) => {
      return npath.toPortablePath(path);
    });
  }
  readlinkSync(p) {
    return npath.toPortablePath(this.realFs.readlinkSync(npath.fromPortablePath(p)));
  }
  async truncatePromise(p, len) {
    return await new Promise((resolve, reject) => {
      this.realFs.truncate(npath.fromPortablePath(p), len, this.makeCallback(resolve, reject));
    });
  }
  truncateSync(p, len) {
    return this.realFs.truncateSync(npath.fromPortablePath(p), len);
  }
  async ftruncatePromise(fd, len) {
    return await new Promise((resolve, reject) => {
      this.realFs.ftruncate(fd, len, this.makeCallback(resolve, reject));
    });
  }
  ftruncateSync(fd, len) {
    return this.realFs.ftruncateSync(fd, len);
  }
  watch(p, a, b) {
    return this.realFs.watch(
      npath.fromPortablePath(p),
      a,
      b
    );
  }
  watchFile(p, a, b) {
    return this.realFs.watchFile(
      npath.fromPortablePath(p),
      a,
      b
    );
  }
  unwatchFile(p, cb) {
    return this.realFs.unwatchFile(npath.fromPortablePath(p), cb);
  }
  makeCallback(resolve, reject) {
    return (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };
  }
}

const NUMBER_REGEXP = /^[0-9]+$/;
const VIRTUAL_REGEXP = /^(\/(?:[^/]+\/)*?(?:\$\$virtual|__virtual__))((?:\/((?:[^/]+-)?[a-f0-9]+)(?:\/([^/]+))?)?((?:\/.*)?))$/;
const VALID_COMPONENT = /^([^/]+-)?[a-f0-9]+$/;
class VirtualFS extends ProxiedFS {
  constructor({ baseFs = new NodeFS() } = {}) {
    super(ppath);
    this.baseFs = baseFs;
  }
  static makeVirtualPath(base, component, to) {
    if (ppath.basename(base) !== `__virtual__`)
      throw new Error(`Assertion failed: Virtual folders must be named "__virtual__"`);
    if (!ppath.basename(component).match(VALID_COMPONENT))
      throw new Error(`Assertion failed: Virtual components must be ended by an hexadecimal hash`);
    const target = ppath.relative(ppath.dirname(base), to);
    const segments = target.split(`/`);
    let depth = 0;
    while (depth < segments.length && segments[depth] === `..`)
      depth += 1;
    const finalSegments = segments.slice(depth);
    const fullVirtualPath = ppath.join(base, component, String(depth), ...finalSegments);
    return fullVirtualPath;
  }
  static resolveVirtual(p) {
    const match = p.match(VIRTUAL_REGEXP);
    if (!match || !match[3] && match[5])
      return p;
    const target = ppath.dirname(match[1]);
    if (!match[3] || !match[4])
      return target;
    const isnum = NUMBER_REGEXP.test(match[4]);
    if (!isnum)
      return p;
    const depth = Number(match[4]);
    const backstep = `../`.repeat(depth);
    const subpath = match[5] || `.`;
    return VirtualFS.resolveVirtual(ppath.join(target, backstep, subpath));
  }
  getExtractHint(hints) {
    return this.baseFs.getExtractHint(hints);
  }
  getRealPath() {
    return this.baseFs.getRealPath();
  }
  realpathSync(p) {
    const match = p.match(VIRTUAL_REGEXP);
    if (!match)
      return this.baseFs.realpathSync(p);
    if (!match[5])
      return p;
    const realpath = this.baseFs.realpathSync(this.mapToBase(p));
    return VirtualFS.makeVirtualPath(match[1], match[3], realpath);
  }
  async realpathPromise(p) {
    const match = p.match(VIRTUAL_REGEXP);
    if (!match)
      return await this.baseFs.realpathPromise(p);
    if (!match[5])
      return p;
    const realpath = await this.baseFs.realpathPromise(this.mapToBase(p));
    return VirtualFS.makeVirtualPath(match[1], match[3], realpath);
  }
  mapToBase(p) {
    if (p === ``)
      return p;
    if (this.pathUtils.isAbsolute(p))
      return VirtualFS.resolveVirtual(p);
    const resolvedRoot = VirtualFS.resolveVirtual(this.baseFs.resolve(PortablePath.dot));
    const resolvedP = VirtualFS.resolveVirtual(this.baseFs.resolve(p));
    return ppath.relative(resolvedRoot, resolvedP) || PortablePath.dot;
  }
  mapFromBase(p) {
    return p;
  }
}

const URL = Number(process.versions.node.split('.', 1)[0]) < 20 ? URL$1 : globalThis.URL;

const [major, minor] = process.versions.node.split(`.`).map((value) => parseInt(value, 10));
const WATCH_MODE_MESSAGE_USES_ARRAYS = major > 19 || major === 19 && minor >= 2 || major === 18 && minor >= 13;
const HAS_LAZY_LOADED_TRANSLATORS = major === 20 && minor < 6 || major === 19 && minor >= 3;
const SUPPORTS_IMPORT_ATTRIBUTES = major >= 21 || major === 20 && minor >= 10 || major === 18 && minor >= 20;
const SUPPORTS_IMPORT_ATTRIBUTES_ONLY = major >= 22;

function readPackageScope(checkPath) {
  const rootSeparatorIndex = checkPath.indexOf(npath.sep);
  let separatorIndex;
  do {
    separatorIndex = checkPath.lastIndexOf(npath.sep);
    checkPath = checkPath.slice(0, separatorIndex);
    if (checkPath.endsWith(`${npath.sep}node_modules`))
      return false;
    const pjson = readPackage(checkPath + npath.sep);
    if (pjson) {
      return {
        data: pjson,
        path: checkPath
      };
    }
  } while (separatorIndex > rootSeparatorIndex);
  return false;
}
function readPackage(requestPath) {
  const jsonPath = npath.resolve(requestPath, `package.json`);
  if (!fs.existsSync(jsonPath))
    return null;
  return JSON.parse(fs.readFileSync(jsonPath, `utf8`));
}

async function tryReadFile$1(path2) {
  try {
    return await fs.promises.readFile(path2, `utf8`);
  } catch (error) {
    if (error.code === `ENOENT`)
      return null;
    throw error;
  }
}
function tryParseURL(str, base) {
  try {
    return new URL(str, base);
  } catch {
    return null;
  }
}
let entrypointPath = null;
function setEntrypointPath(file) {
  entrypointPath = file;
}
function getFileFormat(filepath) {
  const ext = path.extname(filepath);
  switch (ext) {
    case `.mjs`: {
      return `module`;
    }
    case `.cjs`: {
      return `commonjs`;
    }
    case `.wasm`: {
      throw new Error(
        `Unknown file extension ".wasm" for ${filepath}`
      );
    }
    case `.json`: {
      return `json`;
    }
    case `.js`: {
      const pkg = readPackageScope(filepath);
      if (!pkg)
        return `commonjs`;
      return pkg.data.type ?? `commonjs`;
    }
    default: {
      if (entrypointPath !== filepath)
        return null;
      const pkg = readPackageScope(filepath);
      if (!pkg)
        return `commonjs`;
      if (pkg.data.type === `module`)
        return null;
      return pkg.data.type ?? `commonjs`;
    }
  }
}

async function load$1(urlString, context, nextLoad) {
  const url = tryParseURL(urlString);
  if (url?.protocol !== `file:`)
    return nextLoad(urlString, context, nextLoad);
  const filePath = fileURLToPath(url);
  const format = getFileFormat(filePath);
  if (!format)
    return nextLoad(urlString, context, nextLoad);
  if (format === `json`) {
    if (SUPPORTS_IMPORT_ATTRIBUTES_ONLY) {
      if (context.importAttributes?.type !== `json`) {
        const err = new TypeError(`[ERR_IMPORT_ATTRIBUTE_MISSING]: Module "${urlString}" needs an import attribute of "type: json"`);
        err.code = `ERR_IMPORT_ATTRIBUTE_MISSING`;
        throw err;
      }
    } else {
      const type = `importAttributes` in context ? context.importAttributes?.type : context.importAssertions?.type;
      if (type !== `json`) {
        const err = new TypeError(`[ERR_IMPORT_ASSERTION_TYPE_MISSING]: Module "${urlString}" needs an import ${SUPPORTS_IMPORT_ATTRIBUTES ? `attribute` : `assertion`} of type "json"`);
        err.code = `ERR_IMPORT_ASSERTION_TYPE_MISSING`;
        throw err;
      }
    }
  }
  if (process.env.WATCH_REPORT_DEPENDENCIES && process.send) {
    const pathToSend = pathToFileURL(
      npath.fromPortablePath(
        VirtualFS.resolveVirtual(npath.toPortablePath(filePath))
      )
    ).href;
    process.send({
      "watch:import": WATCH_MODE_MESSAGE_USES_ARRAYS ? [pathToSend] : pathToSend
    });
  }
  return {
    format,
    source: format === `commonjs` ? void 0 : await fs.promises.readFile(filePath, `utf8`),
    shortCircuit: true
  };
}

const ArrayIsArray = Array.isArray;
const JSONStringify = JSON.stringify;
const ObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
const ObjectPrototypeHasOwnProperty = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
const RegExpPrototypeExec = (obj, string) => RegExp.prototype.exec.call(obj, string);
const RegExpPrototypeSymbolReplace = (obj, ...rest) => RegExp.prototype[Symbol.replace].apply(obj, rest);
const StringPrototypeEndsWith = (str, ...rest) => String.prototype.endsWith.apply(str, rest);
const StringPrototypeIncludes = (str, ...rest) => String.prototype.includes.apply(str, rest);
const StringPrototypeLastIndexOf = (str, ...rest) => String.prototype.lastIndexOf.apply(str, rest);
const StringPrototypeIndexOf = (str, ...rest) => String.prototype.indexOf.apply(str, rest);
const StringPrototypeReplace = (str, ...rest) => String.prototype.replace.apply(str, rest);
const StringPrototypeSlice = (str, ...rest) => String.prototype.slice.apply(str, rest);
const StringPrototypeStartsWith = (str, ...rest) => String.prototype.startsWith.apply(str, rest);
const SafeMap = Map;
const JSONParse = JSON.parse;

function createErrorType(code, messageCreator, errorType) {
  return class extends errorType {
    constructor(...args) {
      super(messageCreator(...args));
      this.code = code;
      this.name = `${errorType.name} [${code}]`;
    }
  };
}
const ERR_PACKAGE_IMPORT_NOT_DEFINED = createErrorType(
  `ERR_PACKAGE_IMPORT_NOT_DEFINED`,
  (specifier, packagePath, base) => {
    return `Package import specifier "${specifier}" is not defined${packagePath ? ` in package ${packagePath}package.json` : ``} imported from ${base}`;
  },
  TypeError
);
const ERR_INVALID_MODULE_SPECIFIER = createErrorType(
  `ERR_INVALID_MODULE_SPECIFIER`,
  (request, reason, base = void 0) => {
    return `Invalid module "${request}" ${reason}${base ? ` imported from ${base}` : ``}`;
  },
  TypeError
);
const ERR_INVALID_PACKAGE_TARGET = createErrorType(
  `ERR_INVALID_PACKAGE_TARGET`,
  (pkgPath, key, target, isImport = false, base = void 0) => {
    const relError = typeof target === `string` && !isImport && target.length && !StringPrototypeStartsWith(target, `./`);
    if (key === `.`) {
      assert(isImport === false);
      return `Invalid "exports" main target ${JSONStringify(target)} defined in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ``}${relError ? `; targets must start with "./"` : ``}`;
    }
    return `Invalid "${isImport ? `imports` : `exports`}" target ${JSONStringify(
      target
    )} defined for '${key}' in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ``}${relError ? `; targets must start with "./"` : ``}`;
  },
  Error
);
const ERR_INVALID_PACKAGE_CONFIG = createErrorType(
  `ERR_INVALID_PACKAGE_CONFIG`,
  (path, base, message) => {
    return `Invalid package config ${path}${base ? ` while importing ${base}` : ``}${message ? `. ${message}` : ``}`;
  },
  Error
);

function filterOwnProperties(source, keys) {
  const filtered = /* @__PURE__ */ Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (ObjectPrototypeHasOwnProperty(source, key)) {
      filtered[key] = source[key];
    }
  }
  return filtered;
}

const packageJSONCache = new SafeMap();
function getPackageConfig(path, specifier, base, readFileSyncFn) {
  const existing = packageJSONCache.get(path);
  if (existing !== void 0) {
    return existing;
  }
  const source = readFileSyncFn(path);
  if (source === void 0) {
    const packageConfig2 = {
      pjsonPath: path,
      exists: false,
      main: void 0,
      name: void 0,
      type: "none",
      exports: void 0,
      imports: void 0
    };
    packageJSONCache.set(path, packageConfig2);
    return packageConfig2;
  }
  let packageJSON;
  try {
    packageJSON = JSONParse(source);
  } catch (error) {
    throw new ERR_INVALID_PACKAGE_CONFIG(
      path,
      (base ? `"${specifier}" from ` : "") + fileURLToPath(base || specifier),
      error.message
    );
  }
  let { imports, main, name, type } = filterOwnProperties(packageJSON, [
    "imports",
    "main",
    "name",
    "type"
  ]);
  const exports = ObjectPrototypeHasOwnProperty(packageJSON, "exports") ? packageJSON.exports : void 0;
  if (typeof imports !== "object" || imports === null) {
    imports = void 0;
  }
  if (typeof main !== "string") {
    main = void 0;
  }
  if (typeof name !== "string") {
    name = void 0;
  }
  if (type !== "module" && type !== "commonjs") {
    type = "none";
  }
  const packageConfig = {
    pjsonPath: path,
    exists: true,
    main,
    name,
    type,
    exports,
    imports
  };
  packageJSONCache.set(path, packageConfig);
  return packageConfig;
}
function getPackageScopeConfig(resolved, readFileSyncFn) {
  let packageJSONUrl = new URL("./package.json", resolved);
  while (true) {
    const packageJSONPath2 = packageJSONUrl.pathname;
    if (StringPrototypeEndsWith(packageJSONPath2, "node_modules/package.json")) {
      break;
    }
    const packageConfig2 = getPackageConfig(
      fileURLToPath(packageJSONUrl),
      resolved,
      void 0,
      readFileSyncFn
    );
    if (packageConfig2.exists) {
      return packageConfig2;
    }
    const lastPackageJSONUrl = packageJSONUrl;
    packageJSONUrl = new URL("../package.json", packageJSONUrl);
    if (packageJSONUrl.pathname === lastPackageJSONUrl.pathname) {
      break;
    }
  }
  const packageJSONPath = fileURLToPath(packageJSONUrl);
  const packageConfig = {
    pjsonPath: packageJSONPath,
    exists: false,
    main: void 0,
    name: void 0,
    type: "none",
    exports: void 0,
    imports: void 0
  };
  packageJSONCache.set(packageJSONPath, packageConfig);
  return packageConfig;
}

function throwImportNotDefined(specifier, packageJSONUrl, base) {
  throw new ERR_PACKAGE_IMPORT_NOT_DEFINED(
    specifier,
    packageJSONUrl && fileURLToPath(new URL(".", packageJSONUrl)),
    fileURLToPath(base)
  );
}
function throwInvalidSubpath(subpath, packageJSONUrl, internal, base) {
  const reason = `request is not a valid subpath for the "${internal ? "imports" : "exports"}" resolution of ${fileURLToPath(packageJSONUrl)}`;
  throw new ERR_INVALID_MODULE_SPECIFIER(
    subpath,
    reason,
    base && fileURLToPath(base)
  );
}
function throwInvalidPackageTarget(subpath, target, packageJSONUrl, internal, base) {
  if (typeof target === "object" && target !== null) {
    target = JSONStringify(target, null, "");
  } else {
    target = `${target}`;
  }
  throw new ERR_INVALID_PACKAGE_TARGET(
    fileURLToPath(new URL(".", packageJSONUrl)),
    subpath,
    target,
    internal,
    base && fileURLToPath(base)
  );
}
const invalidSegmentRegEx = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;
const patternRegEx = /\*/g;
function resolvePackageTargetString(target, subpath, match, packageJSONUrl, base, pattern, internal, conditions) {
  if (subpath !== "" && !pattern && target[target.length - 1] !== "/")
    throwInvalidPackageTarget(match, target, packageJSONUrl, internal, base);
  if (!StringPrototypeStartsWith(target, "./")) {
    if (internal && !StringPrototypeStartsWith(target, "../") && !StringPrototypeStartsWith(target, "/")) {
      let isURL = false;
      try {
        new URL(target);
        isURL = true;
      } catch {
      }
      if (!isURL) {
        const exportTarget = pattern ? RegExpPrototypeSymbolReplace(patternRegEx, target, () => subpath) : target + subpath;
        return exportTarget;
      }
    }
    throwInvalidPackageTarget(match, target, packageJSONUrl, internal, base);
  }
  if (RegExpPrototypeExec(
    invalidSegmentRegEx,
    StringPrototypeSlice(target, 2)
  ) !== null)
    throwInvalidPackageTarget(match, target, packageJSONUrl, internal, base);
  const resolved = new URL(target, packageJSONUrl);
  const resolvedPath = resolved.pathname;
  const packagePath = new URL(".", packageJSONUrl).pathname;
  if (!StringPrototypeStartsWith(resolvedPath, packagePath))
    throwInvalidPackageTarget(match, target, packageJSONUrl, internal, base);
  if (subpath === "")
    return resolved;
  if (RegExpPrototypeExec(invalidSegmentRegEx, subpath) !== null) {
    const request = pattern ? StringPrototypeReplace(match, "*", () => subpath) : match + subpath;
    throwInvalidSubpath(request, packageJSONUrl, internal, base);
  }
  if (pattern) {
    return new URL(
      RegExpPrototypeSymbolReplace(patternRegEx, resolved.href, () => subpath)
    );
  }
  return new URL(subpath, resolved);
}
function isArrayIndex(key) {
  const keyNum = +key;
  if (`${keyNum}` !== key)
    return false;
  return keyNum >= 0 && keyNum < 4294967295;
}
function resolvePackageTarget(packageJSONUrl, target, subpath, packageSubpath, base, pattern, internal, conditions) {
  if (typeof target === "string") {
    return resolvePackageTargetString(
      target,
      subpath,
      packageSubpath,
      packageJSONUrl,
      base,
      pattern,
      internal);
  } else if (ArrayIsArray(target)) {
    if (target.length === 0) {
      return null;
    }
    let lastException;
    for (let i = 0; i < target.length; i++) {
      const targetItem = target[i];
      let resolveResult;
      try {
        resolveResult = resolvePackageTarget(
          packageJSONUrl,
          targetItem,
          subpath,
          packageSubpath,
          base,
          pattern,
          internal,
          conditions
        );
      } catch (e) {
        lastException = e;
        if (e.code === "ERR_INVALID_PACKAGE_TARGET") {
          continue;
        }
        throw e;
      }
      if (resolveResult === void 0) {
        continue;
      }
      if (resolveResult === null) {
        lastException = null;
        continue;
      }
      return resolveResult;
    }
    if (lastException === void 0 || lastException === null)
      return lastException;
    throw lastException;
  } else if (typeof target === "object" && target !== null) {
    const keys = ObjectGetOwnPropertyNames(target);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (isArrayIndex(key)) {
        throw new ERR_INVALID_PACKAGE_CONFIG(
          fileURLToPath(packageJSONUrl),
          base,
          '"exports" cannot contain numeric property keys.'
        );
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === "default" || conditions.has(key)) {
        const conditionalTarget = target[key];
        const resolveResult = resolvePackageTarget(
          packageJSONUrl,
          conditionalTarget,
          subpath,
          packageSubpath,
          base,
          pattern,
          internal,
          conditions
        );
        if (resolveResult === void 0)
          continue;
        return resolveResult;
      }
    }
    return void 0;
  } else if (target === null) {
    return null;
  }
  throwInvalidPackageTarget(
    packageSubpath,
    target,
    packageJSONUrl,
    internal,
    base
  );
}
function patternKeyCompare(a, b) {
  const aPatternIndex = StringPrototypeIndexOf(a, "*");
  const bPatternIndex = StringPrototypeIndexOf(b, "*");
  const baseLenA = aPatternIndex === -1 ? a.length : aPatternIndex + 1;
  const baseLenB = bPatternIndex === -1 ? b.length : bPatternIndex + 1;
  if (baseLenA > baseLenB)
    return -1;
  if (baseLenB > baseLenA)
    return 1;
  if (aPatternIndex === -1)
    return 1;
  if (bPatternIndex === -1)
    return -1;
  if (a.length > b.length)
    return -1;
  if (b.length > a.length)
    return 1;
  return 0;
}
function packageImportsResolve({ name, base, conditions, readFileSyncFn }) {
  if (name === "#" || StringPrototypeStartsWith(name, "#/") || StringPrototypeEndsWith(name, "/")) {
    const reason = "is not a valid internal imports specifier name";
    throw new ERR_INVALID_MODULE_SPECIFIER(name, reason, fileURLToPath(base));
  }
  let packageJSONUrl;
  const packageConfig = getPackageScopeConfig(base, readFileSyncFn);
  if (packageConfig.exists) {
    packageJSONUrl = pathToFileURL(packageConfig.pjsonPath);
    const imports = packageConfig.imports;
    if (imports) {
      if (ObjectPrototypeHasOwnProperty(imports, name) && !StringPrototypeIncludes(name, "*")) {
        const resolveResult = resolvePackageTarget(
          packageJSONUrl,
          imports[name],
          "",
          name,
          base,
          false,
          true,
          conditions
        );
        if (resolveResult != null) {
          return resolveResult;
        }
      } else {
        let bestMatch = "";
        let bestMatchSubpath;
        const keys = ObjectGetOwnPropertyNames(imports);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const patternIndex = StringPrototypeIndexOf(key, "*");
          if (patternIndex !== -1 && StringPrototypeStartsWith(
            name,
            StringPrototypeSlice(key, 0, patternIndex)
          )) {
            const patternTrailer = StringPrototypeSlice(key, patternIndex + 1);
            if (name.length >= key.length && StringPrototypeEndsWith(name, patternTrailer) && patternKeyCompare(bestMatch, key) === 1 && StringPrototypeLastIndexOf(key, "*") === patternIndex) {
              bestMatch = key;
              bestMatchSubpath = StringPrototypeSlice(
                name,
                patternIndex,
                name.length - patternTrailer.length
              );
            }
          }
        }
        if (bestMatch) {
          const target = imports[bestMatch];
          const resolveResult = resolvePackageTarget(
            packageJSONUrl,
            target,
            bestMatchSubpath,
            bestMatch,
            base,
            true,
            true,
            conditions
          );
          if (resolveResult != null) {
            return resolveResult;
          }
        }
      }
    }
  }
  throwImportNotDefined(name, packageJSONUrl, base);
}

let findPnpApi = esmModule.findPnpApi;
if (!findPnpApi) {
  const require = createRequire(import.meta.url);
  const pnpApi = require(`./.pnp.cjs`);
  pnpApi.setup();
  findPnpApi = esmModule.findPnpApi;
}
const pathRegExp = /^(?![a-zA-Z]:[\\/]|\\\\|\.{0,2}(?:\/|$))((?:node:)?(?:@[^/]+\/)?[^/]+)\/*(.*|)$/;
const isRelativeRegexp = /^\.{0,2}\//;
function tryReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, `utf8`);
  } catch (err) {
    if (err.code === `ENOENT`)
      return void 0;
    throw err;
  }
}
async function resolvePrivateRequest(specifier, issuer, context, nextResolve) {
  const resolved = packageImportsResolve({
    name: specifier,
    base: pathToFileURL(issuer),
    conditions: new Set(context.conditions),
    readFileSyncFn: tryReadFile
  });
  if (resolved instanceof URL) {
    return { url: resolved.href, shortCircuit: true };
  } else {
    if (resolved.startsWith(`#`))
      throw new Error(`Mapping from one private import to another isn't allowed`);
    return resolve$1(resolved, context, nextResolve);
  }
}
async function resolve$1(originalSpecifier, context, nextResolve) {
  if (!findPnpApi || isBuiltin(originalSpecifier))
    return nextResolve(originalSpecifier, context, nextResolve);
  let specifier = originalSpecifier;
  const url = tryParseURL(specifier, isRelativeRegexp.test(specifier) ? context.parentURL : void 0);
  if (url) {
    if (url.protocol !== `file:`)
      return nextResolve(originalSpecifier, context, nextResolve);
    specifier = fileURLToPath(url);
  }
  const { parentURL, conditions = [] } = context;
  const issuer = parentURL && tryParseURL(parentURL)?.protocol === `file:` ? fileURLToPath(parentURL) : process.cwd();
  const pnpapi = findPnpApi(issuer) ?? (url ? findPnpApi(specifier) : null);
  if (!pnpapi)
    return nextResolve(originalSpecifier, context, nextResolve);
  if (specifier.startsWith(`#`))
    return resolvePrivateRequest(specifier, issuer, context, nextResolve);
  const dependencyNameMatch = specifier.match(pathRegExp);
  let allowLegacyResolve = false;
  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;
    if (subPath === `` && dependencyName !== `pnpapi`) {
      const resolved = pnpapi.resolveToUnqualified(`${dependencyName}/package.json`, issuer);
      if (resolved) {
        const content = await tryReadFile$1(resolved);
        if (content) {
          const pkg = JSON.parse(content);
          allowLegacyResolve = pkg.exports == null;
        }
      }
    }
  }
  let result;
  try {
    result = pnpapi.resolveRequest(specifier, issuer, {
      conditions: new Set(conditions),
      extensions: allowLegacyResolve ? void 0 : []
    });
  } catch (err) {
    if (err instanceof Error && `code` in err && err.code === `MODULE_NOT_FOUND`)
      err.code = `ERR_MODULE_NOT_FOUND`;
    throw err;
  }
  if (!result)
    throw new Error(`Resolving '${specifier}' from '${issuer}' failed`);
  const resultURL = pathToFileURL(result);
  if (url) {
    resultURL.search = url.search;
    resultURL.hash = url.hash;
  }
  if (!parentURL)
    setEntrypointPath(fileURLToPath(resultURL));
  return {
    url: resultURL.href,
    shortCircuit: true
  };
}

if (!HAS_LAZY_LOADED_TRANSLATORS) {
  const binding = process.binding(`fs`);
  const originalReadFile = binding.readFileUtf8 || binding.readFileSync;
  if (originalReadFile) {
    binding[originalReadFile.name] = function(...args) {
      try {
        return fs.readFileSync(args[0], {
          encoding: `utf8`,
          flag: args[1]
        });
      } catch {
      }
      return originalReadFile.apply(this, args);
    };
  } else {
    const binding2 = process.binding(`fs`);
    const originalfstat = binding2.fstat;
    const ZIP_MASK = 4278190080;
    const ZIP_MAGIC = 704643072;
    binding2.fstat = function(...args) {
      const [fd, useBigint, req] = args;
      if ((fd & ZIP_MASK) === ZIP_MAGIC && useBigint === false && req === void 0) {
        try {
          const stats = fs.fstatSync(fd);
          return new Float64Array([
            stats.dev,
            stats.mode,
            stats.nlink,
            stats.uid,
            stats.gid,
            stats.rdev,
            stats.blksize,
            stats.ino,
            stats.size,
            stats.blocks
          ]);
        } catch {
        }
      }
      return originalfstat.apply(this, args);
    };
  }
}

const resolve = resolve$1;
const load = load$1;

export { load, resolve };
