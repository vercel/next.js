/**
 * WASI preview1 filesystem imports with one fd table shared by every thread.
 *
 * `node:wasi` keeps its guest-fd -> host-fd mapping inside each `WASI` instance. Every wasm thread
 * runs in its own Worker with its own instance, so a file opened on one thread is a bad descriptor
 * on every other thread, or worse, names a different file there. Real programs hand files between
 * threads all the time (Tokio tasks move between workers; `turbo-persistence` syncs and reads files
 * from parallel helper jobs), so that per-thread table is not something the guest can work around.
 *
 * Host OS file descriptors, unlike the `node:wasi` table, are process-wide: a host fd opened in one
 * Worker is valid in all of them. So this module implements the `fd_*` and `path_*` imports itself on
 * top of synchronous `node:fs` calls and keeps the guest-fd table in a `SharedArrayBuffer` that every
 * Worker maps. Each call runs on the calling thread.
 *
 * Concurrency:
 *
 * - The **table lock** only guards allocating, closing and renumbering table entries. It is never
 *   held across a syscall.
 * - Lookups are lock-free. Each entry has a sequence counter (a seqlock) that writers make odd while
 *   they rewrite the entry, so a reader always gets one whole entry, or `EBADF`.
 * - Node has no `lseek`, so the file offset of a seekable fd lives in the table. The calls that use
 *   it (`fd_read`, `fd_write`, `fd_seek`, `fd_tell`) take that fd's **I/O lock**, which is held
 *   across their syscall, so that two threads using one fd's offset behave like a kernel fd: no
 *   bytes read twice, no writes lost. It is per fd, so other fds never wait for it, and positioned
 *   I/O, syncs, stats, path calls and non-seekable fds (pipes, FIFOs, stdio) never take it.
 *   `fd_close` and `fd_renumber` take it too, so no offset call is in flight on an entry they
 *   replace. Lock order: I/O locks (lowest fd first), then the table lock.
 *
 * Everything that is not about files (clocks, random, args/env, `proc_exit`, `sched_yield`, sockets)
 * stays with each thread's own `node:wasi` instance. `poll_oneoff` is split: clock-only polls go to
 * `node:wasi`, polls on fds are answered from the shared table.
 *
 * Paths resolve component by component like the OS does, confined to the directory fd they are
 * relative to: absolute paths, `..` above the base, and symlinks leading out of it fail with
 * `ENOTCAPABLE`. A directory fd resolves through its host path, so it also records the directory's
 * `dev`/`ino` and fails with `ENOENT` once that path names something else (for example after a
 * rename). Resolution and the following syscall are not atomic: this is a test host, not a sandbox.
 *
 * Rights are recorded and reported, not enforced (the host fd's open mode is what limits I/O).
 *
 * Spec: https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md
 */

import fs from 'node:fs'
import path from 'node:path'

// Errnos (preview1 `errno`).
export const ERRNO = Object.freeze({
  SUCCESS: 0,
  '2BIG': 1,
  ACCES: 2,
  ADDRINUSE: 3,
  ADDRNOTAVAIL: 4,
  AFNOSUPPORT: 5,
  AGAIN: 6,
  ALREADY: 7,
  BADF: 8,
  BADMSG: 9,
  BUSY: 10,
  CANCELED: 11,
  CHILD: 12,
  CONNABORTED: 13,
  CONNREFUSED: 14,
  CONNRESET: 15,
  DEADLK: 16,
  DESTADDRREQ: 17,
  DOM: 18,
  DQUOT: 19,
  EXIST: 20,
  FAULT: 21,
  FBIG: 22,
  HOSTUNREACH: 23,
  IDRM: 24,
  ILSEQ: 25,
  INPROGRESS: 26,
  INTR: 27,
  INVAL: 28,
  IO: 29,
  ISCONN: 30,
  ISDIR: 31,
  LOOP: 32,
  MFILE: 33,
  MLINK: 34,
  MSGSIZE: 35,
  MULTIHOP: 36,
  NAMETOOLONG: 37,
  NETDOWN: 38,
  NETRESET: 39,
  NETUNREACH: 40,
  NFILE: 41,
  NOBUFS: 42,
  NODEV: 43,
  NOENT: 44,
  NOEXEC: 45,
  NOLCK: 46,
  NOLINK: 47,
  NOMEM: 48,
  NOMSG: 49,
  NOPROTOOPT: 50,
  NOSPC: 51,
  NOSYS: 52,
  NOTCONN: 53,
  NOTDIR: 54,
  NOTEMPTY: 55,
  NOTRECOVERABLE: 56,
  NOTSOCK: 57,
  NOTSUP: 58,
  NOTTY: 59,
  NXIO: 60,
  OVERFLOW: 61,
  OWNERDEAD: 62,
  PERM: 63,
  PIPE: 64,
  RANGE: 65,
  ROFS: 66,
  SPIPE: 67,
  SRCH: 68,
  STALE: 69,
  TIMEDOUT: 70,
  TXTBSY: 71,
  XDEV: 72,
  NOTCAPABLE: 76,
})

/** Host error codes whose name does not map to a WASI errno by dropping the leading `E`. */
const HOST_ERROR_ALIASES = {
  EOPNOTSUPP: ERRNO.NOTSUP,
  EWOULDBLOCK: ERRNO.AGAIN,
}

// `filetype`.
export const FILETYPE = Object.freeze({
  UNKNOWN: 0,
  BLOCK_DEVICE: 1,
  CHARACTER_DEVICE: 2,
  DIRECTORY: 3,
  REGULAR_FILE: 4,
  SOCKET_DGRAM: 5,
  SOCKET_STREAM: 6,
  SYMBOLIC_LINK: 7,
})

// `oflags`, `fdflags`, `lookupflags`, `fstflags`, `whence`, `eventtype`.
export const OFLAGS = Object.freeze({
  CREAT: 1,
  DIRECTORY: 2,
  EXCL: 4,
  TRUNC: 8,
})
export const FDFLAGS = Object.freeze({
  APPEND: 1,
  DSYNC: 2,
  NONBLOCK: 4,
  RSYNC: 8,
  SYNC: 16,
})
export const LOOKUP_SYMLINK_FOLLOW = 1
const FSTFLAGS = { ATIM: 1, ATIM_NOW: 2, MTIM: 4, MTIM_NOW: 8 }
const WHENCE = { SET: 0, CUR: 1, END: 2 }
const EVENTTYPE = { CLOCK: 0, FD_READ: 1, FD_WRITE: 2 }

// `rights` bits used to choose the host open mode, as `uvwasi` does.
export const RIGHTS = Object.freeze({
  FD_DATASYNC: 1n << 0n,
  FD_READ: 1n << 1n,
  FD_WRITE: 1n << 6n,
  FD_ALLOCATE: 1n << 8n,
  FD_READDIR: 1n << 14n,
  FD_FILESTAT_SET_SIZE: 1n << 22n,
  ALL: (1n << 29n) - 1n,
})
const WRITE_RIGHTS =
  RIGHTS.FD_DATASYNC |
  RIGHTS.FD_WRITE |
  RIGHTS.FD_ALLOCATE |
  RIGHTS.FD_FILESTAT_SET_SIZE
const READ_RIGHTS = RIGHTS.FD_READ | RIGHTS.FD_READDIR

// Struct sizes (preview1 ABI).
const FDSTAT_SIZE = 24
const FILESTAT_SIZE = 64
const DIRENT_SIZE = 24
const SUBSCRIPTION_SIZE = 48
const EVENT_SIZE = 32

/** Symlink expansions allowed while resolving one path, like Linux's `MAXSYMLINKS`. */
const MAX_SYMLINKS = 40

// ---------------------------------------------------------------------------------------------
// Shared table layout
//
// One SharedArrayBuffer holds:
//   header   Int32[HEADER_I32]               [0] = table lock
//   slots    Int32[MAX_FDS * SLOT_I32]       per guest fd: state, host fd, filetype, fdflags, dir
//                                            index, preopen flag, sequence counter, I/O lock
//   slots64  BigInt64[MAX_FDS * SLOT_I64]    per guest fd: rights base, rights inheriting, offset
//   dirs     Int32[MAX_DIRS * DIR_I32]       per directory: in use, host path length, name length
//   dirs64   BigInt64[MAX_DIRS * DIR_I64]    per directory: dev, ino
//   names    Uint8[MAX_DIRS * DIR_BYTES]     per directory: host path bytes, then preopen name bytes
//
// A directory record belongs to exactly one slot and only changes together with it, under that
// slot's sequence counter.
// ---------------------------------------------------------------------------------------------

export const MAX_FDS = 16_384
export const MAX_DIRS = 1_024
const DIR_BYTES = 8_192

const HEADER_I32 = 4
const SLOT_I32 = 8
const SLOT_I64 = 4
const DIR_I32 = 4
const DIR_I64 = 2

const SLOT_STATE = 0
const SLOT_HOST_FD = 1
const SLOT_FILETYPE = 2
const SLOT_FDFLAGS = 3
const SLOT_DIR = 4
const SLOT_PREOPEN = 5
const SLOT_SEQ = 6
const SLOT_IO_LOCK = 7

const SLOT_RIGHTS_BASE = 0
const SLOT_RIGHTS_INHERITING = 1
const SLOT_OFFSET = 2

const STATE_FREE = 0
const STATE_OPEN = 1

const DIR_IN_USE = 0
const DIR_PATH_LEN = 1
const DIR_NAME_LEN = 2
const DIR_DEV = 0
const DIR_INO = 1

const OFFSET_HEADER = 0
const OFFSET_SLOTS = OFFSET_HEADER + HEADER_I32 * 4
const OFFSET_SLOTS64 = OFFSET_SLOTS + MAX_FDS * SLOT_I32 * 4
const OFFSET_DIRS = OFFSET_SLOTS64 + MAX_FDS * SLOT_I64 * 8
const OFFSET_DIRS64 = OFFSET_DIRS + MAX_DIRS * DIR_I32 * 4
const OFFSET_NAMES = OFFSET_DIRS64 + MAX_DIRS * DIR_I64 * 8
const TABLE_BYTES = OFFSET_NAMES + MAX_DIRS * DIR_BYTES

/** Allocate the shared fd table. Pass the returned buffer to every Worker. */
export function createSharedFdTableBuffer() {
  return new SharedArrayBuffer(TABLE_BYTES)
}

class WasiError extends Error {
  constructor(errno) {
    super(`wasi errno ${errno}`)
    this.errno = errno
  }
}

function fail(errno) {
  throw new WasiError(errno)
}

/** Map a thrown host error (or `WasiError`) to a WASI errno. */
export function toErrno(error) {
  if (error instanceof WasiError) return error.errno
  const code = error?.code
  if (typeof code === 'string') {
    if (code in HOST_ERROR_ALIASES) return HOST_ERROR_ALIASES[code]
    const name = code.startsWith('E') ? code.slice(1) : code
    if (Object.hasOwn(ERRNO, name)) return ERRNO[name]
  }
  if (error instanceof RangeError || error instanceof TypeError) {
    return ERRNO.INVAL
  }
  return ERRNO.IO
}

/** A guest file position as a JS number; positions JS cannot represent exactly are invalid. */
function toPosition(value) {
  const position = BigInt.asUintN(64, value)
  if (position > BigInt(Number.MAX_SAFE_INTEGER)) fail(ERRNO.INVAL)
  return Number(position)
}

/** A new file offset; one JS cannot represent exactly overflows. */
function checkedOffset(offset) {
  if (offset > BigInt(Number.MAX_SAFE_INTEGER)) fail(ERRNO.OVERFLOW)
  return offset
}

function filetypeOf(stats) {
  if (stats.isFile()) return FILETYPE.REGULAR_FILE
  if (stats.isDirectory()) return FILETYPE.DIRECTORY
  if (stats.isSymbolicLink()) return FILETYPE.SYMBOLIC_LINK
  if (stats.isCharacterDevice()) return FILETYPE.CHARACTER_DEVICE
  if (stats.isBlockDevice()) return FILETYPE.BLOCK_DEVICE
  if (stats.isSocket()) return FILETYPE.SOCKET_STREAM
  return FILETYPE.UNKNOWN
}

function isInside(base, candidate) {
  if (candidate === base) return true
  const prefix = base.endsWith(path.sep) ? base : base + path.sep
  return candidate.startsWith(prefix)
}

/** Spin until `cell` is 0 and set it to 1, sleeping on the cell while someone else holds it. */
function acquire(cells, index) {
  while (Atomics.compareExchange(cells, index, 0, 1) !== 0) {
    Atomics.wait(cells, index, 1)
  }
}

function release(cells, index) {
  Atomics.store(cells, index, 0)
  Atomics.notify(cells, index, 1)
}

/**
 * The shared fd table as seen by one thread. Every thread constructs its own view over the same
 * buffer; all state lives in the buffer.
 */
export class SharedFdTable {
  /** @param {SharedArrayBuffer} buffer from `createSharedFdTableBuffer` */
  constructor(buffer) {
    if (
      !(buffer instanceof SharedArrayBuffer) ||
      buffer.byteLength !== TABLE_BYTES
    ) {
      throw new TypeError('expected a buffer from createSharedFdTableBuffer()')
    }
    this.header = new Int32Array(buffer, OFFSET_HEADER, HEADER_I32)
    this.slots = new Int32Array(buffer, OFFSET_SLOTS, MAX_FDS * SLOT_I32)
    this.slots64 = new BigInt64Array(buffer, OFFSET_SLOTS64, MAX_FDS * SLOT_I64)
    this.dirs = new Int32Array(buffer, OFFSET_DIRS, MAX_DIRS * DIR_I32)
    this.dirs64 = new BigInt64Array(buffer, OFFSET_DIRS64, MAX_DIRS * DIR_I64)
    this.names = new Uint8Array(buffer, OFFSET_NAMES, MAX_DIRS * DIR_BYTES)
  }

  static checkFd(fd) {
    if (!Number.isInteger(fd) || fd < 0 || fd >= MAX_FDS) fail(ERRNO.BADF)
  }

  // --- table lock: allocation, close and renumber only; never held across a syscall ----------

  lockTable() {
    acquire(this.header, 0)
  }

  unlockTable() {
    release(this.header, 0)
  }

  // --- per-fd I/O lock: serializes calls that use one fd's shared offset ------------------------

  lockIo(fd) {
    SharedFdTable.checkFd(fd)
    acquire(this.slots, fd * SLOT_I32 + SLOT_IO_LOCK)
  }

  unlockIo(fd) {
    release(this.slots, fd * SLOT_I32 + SLOT_IO_LOCK)
  }

  /** Run `body` holding the I/O locks of `fds` (deduplicated, lowest first). */
  withIo(fds, body) {
    const ordered = [...new Set(fds)].sort((a, b) => a - b)
    ordered.forEach((fd) => SharedFdTable.checkFd(fd))
    let locked = 0
    try {
      for (const fd of ordered) {
        this.lockIo(fd)
        locked++
      }
      return body()
    } finally {
      for (let i = locked - 1; i >= 0; i--) this.unlockIo(ordered[i])
    }
  }

  // --- entries -----------------------------------------------------------------------------

  /** Begin rewriting a slot (table lock held): readers retry until `endWrite`. */
  beginWrite(fd) {
    Atomics.add(this.slots, fd * SLOT_I32 + SLOT_SEQ, 1)
  }

  endWrite(fd) {
    Atomics.add(this.slots, fd * SLOT_I32 + SLOT_SEQ, 1)
  }

  /**
   * A consistent snapshot of an open guest fd, or `EBADF`. Lock-free: retried until no writer
   * changed the slot while it was being read.
   */
  get(fd) {
    SharedFdTable.checkFd(fd)
    const base = fd * SLOT_I32
    const base64 = fd * SLOT_I64
    for (;;) {
      const before = Atomics.load(this.slots, base + SLOT_SEQ)
      if (before & 1) continue // a writer is mid-update; it holds the table lock only briefly
      const state = Atomics.load(this.slots, base + SLOT_STATE)
      const entry = {
        fd,
        // Changes whenever the slot is rewritten, so it also identifies this particular entry.
        seq: before,
        open: state === STATE_OPEN,
        hostFd: Atomics.load(this.slots, base + SLOT_HOST_FD),
        filetype: Atomics.load(this.slots, base + SLOT_FILETYPE),
        fdflags: Atomics.load(this.slots, base + SLOT_FDFLAGS),
        dir: Atomics.load(this.slots, base + SLOT_DIR),
        preopen: Atomics.load(this.slots, base + SLOT_PREOPEN) === 1,
        rightsBase: BigInt.asUintN(
          64,
          Atomics.load(this.slots64, base64 + SLOT_RIGHTS_BASE)
        ),
        rightsInheriting: BigInt.asUintN(
          64,
          Atomics.load(this.slots64, base64 + SLOT_RIGHTS_INHERITING)
        ),
        dirInfo: null,
      }
      if (entry.open && entry.dir !== -1) {
        entry.dirInfo = this.readDir(entry.dir)
      }
      if (Atomics.load(this.slots, base + SLOT_SEQ) === before) {
        if (!entry.open) fail(ERRNO.BADF)
        return entry
      }
    }
  }

  readDir(dir) {
    const base = dir * DIR_I32
    const pathLen = Atomics.load(this.dirs, base + DIR_PATH_LEN)
    const nameLen = Atomics.load(this.dirs, base + DIR_NAME_LEN)
    const start = dir * DIR_BYTES
    // `Buffer.from(typedArray)` copies, so the result does not change if the record is reused.
    return {
      hostPath: Buffer.from(
        this.names.subarray(start, start + pathLen)
      ).toString(),
      guestName: Buffer.from(
        this.names.subarray(start + pathLen, start + pathLen + nameLen)
      ),
      dev: Atomics.load(this.dirs64, dir * DIR_I64 + DIR_DEV),
      ino: Atomics.load(this.dirs64, dir * DIR_I64 + DIR_INO),
    }
  }

  // Offsets are only read or written while holding the fd's I/O lock (or for `poll_oneoff`'s
  // advisory byte count).
  getOffset(fd) {
    return Atomics.load(this.slots64, fd * SLOT_I64 + SLOT_OFFSET)
  }

  setOffset(fd, offset) {
    Atomics.store(this.slots64, fd * SLOT_I64 + SLOT_OFFSET, offset)
  }

  writeRights(fd, base, inheriting) {
    Atomics.store(
      this.slots64,
      fd * SLOT_I64 + SLOT_RIGHTS_BASE,
      BigInt.asIntN(64, base)
    )
    Atomics.store(
      this.slots64,
      fd * SLOT_I64 + SLOT_RIGHTS_INHERITING,
      BigInt.asIntN(64, inheriting)
    )
  }

  /**
   * Publish a new guest fd and return it. Takes the table lock; never call it holding that lock.
   *
   * @param {{ hostFd: number, filetype: number, fdflags: number, rightsBase: bigint, rightsInheriting: bigint, dir?: { hostPath: string, guestName?: string, dev: bigint, ino: bigint }, preopen?: boolean, at?: number }} entry
   */
  insert(entry) {
    const pathBytes = entry.dir ? Buffer.from(entry.dir.hostPath) : null
    const nameBytes = entry.dir ? Buffer.from(entry.dir.guestName ?? '') : null
    if (pathBytes && pathBytes.length + nameBytes.length > DIR_BYTES) {
      fail(ERRNO.NAMETOOLONG)
    }

    this.lockTable()
    try {
      let fd = -1
      if (entry.at !== undefined) {
        SharedFdTable.checkFd(entry.at)
        if (this.stateOf(entry.at) !== STATE_FREE) fail(ERRNO.BADF)
        fd = entry.at
      } else {
        for (let candidate = 0; candidate < MAX_FDS; candidate++) {
          if (this.stateOf(candidate) === STATE_FREE) {
            fd = candidate
            break
          }
        }
      }
      if (fd === -1) fail(ERRNO.NFILE)

      let dir = -1
      if (pathBytes) {
        for (let candidate = 0; candidate < MAX_DIRS; candidate++) {
          if (Atomics.load(this.dirs, candidate * DIR_I32 + DIR_IN_USE) === 0) {
            dir = candidate
            break
          }
        }
        if (dir === -1) fail(ERRNO.NFILE)
      }

      this.beginWrite(fd)
      if (dir !== -1) {
        const start = dir * DIR_BYTES
        this.names.set(pathBytes, start)
        this.names.set(nameBytes, start + pathBytes.length)
        Atomics.store(this.dirs, dir * DIR_I32 + DIR_PATH_LEN, pathBytes.length)
        Atomics.store(this.dirs, dir * DIR_I32 + DIR_NAME_LEN, nameBytes.length)
        Atomics.store(this.dirs64, dir * DIR_I64 + DIR_DEV, entry.dir.dev)
        Atomics.store(this.dirs64, dir * DIR_I64 + DIR_INO, entry.dir.ino)
        Atomics.store(this.dirs, dir * DIR_I32 + DIR_IN_USE, 1)
      }
      const base = fd * SLOT_I32
      Atomics.store(this.slots, base + SLOT_HOST_FD, entry.hostFd)
      Atomics.store(this.slots, base + SLOT_FILETYPE, entry.filetype)
      Atomics.store(this.slots, base + SLOT_FDFLAGS, entry.fdflags)
      Atomics.store(this.slots, base + SLOT_DIR, dir)
      Atomics.store(this.slots, base + SLOT_PREOPEN, entry.preopen ? 1 : 0)
      this.writeRights(fd, entry.rightsBase, entry.rightsInheriting)
      // No offset call can be in flight on a free slot: `remove`/`renumber` held its I/O lock while
      // freeing it, and later callers see it closed. So the offset can be reset here.
      this.setOffset(fd, 0n)
      Atomics.store(this.slots, base + SLOT_STATE, STATE_OPEN)
      this.endWrite(fd)
      return fd
    } finally {
      this.unlockTable()
    }
  }

  stateOf(fd) {
    return Atomics.load(this.slots, fd * SLOT_I32 + SLOT_STATE)
  }

  /**
   * Re-read `expected` (a snapshot taken before waiting for a lock) and fail with `EBADF` if the slot
   * now holds a different entry: the guest's call was about the entry it named, not a reused fd.
   */
  same(expected) {
    const entry = this.get(expected.fd)
    if (entry.seq !== expected.seq) fail(ERRNO.BADF)
    return entry
  }

  /**
   * Close a guest fd and return its host fd for the caller to close (after all locks are released).
   */
  remove(fd) {
    const named = this.get(fd)
    return this.withIo([fd], () => {
      this.lockTable()
      try {
        const entry = this.same(named)
        this.beginWrite(fd)
        Atomics.store(this.slots, fd * SLOT_I32 + SLOT_STATE, STATE_FREE)
        if (entry.dir !== -1) {
          Atomics.store(this.dirs, entry.dir * DIR_I32 + DIR_IN_USE, 0)
        }
        this.endWrite(fd)
        return entry.hostFd
      } finally {
        this.unlockTable()
      }
    })
  }

  /**
   * Move `from` onto `to` (closing what `to` was). Returns the host fd previously behind `to` for
   * the caller to close, or -1.
   */
  renumber(from, to) {
    const namedSource = this.get(from)
    const namedTarget = this.get(to)
    return this.withIo([from, to], () => {
      this.lockTable()
      try {
        const source = this.same(namedSource)
        const target = this.same(namedTarget)
        if (from === to) return -1
        const offset = this.getOffset(from)
        const toBase = to * SLOT_I32

        this.beginWrite(from)
        this.beginWrite(to)
        if (target.dir !== -1) {
          Atomics.store(this.dirs, target.dir * DIR_I32 + DIR_IN_USE, 0)
        }
        Atomics.store(this.slots, toBase + SLOT_HOST_FD, source.hostFd)
        Atomics.store(this.slots, toBase + SLOT_FILETYPE, source.filetype)
        Atomics.store(this.slots, toBase + SLOT_FDFLAGS, source.fdflags)
        // The directory record moves with the entry.
        Atomics.store(this.slots, toBase + SLOT_DIR, source.dir)
        Atomics.store(this.slots, toBase + SLOT_PREOPEN, source.preopen ? 1 : 0)
        this.writeRights(to, source.rightsBase, source.rightsInheriting)
        this.setOffset(to, offset)
        Atomics.store(this.slots, from * SLOT_I32 + SLOT_STATE, STATE_FREE)
        this.endWrite(to)
        this.endWrite(from)
        return target.hostFd
      } finally {
        this.unlockTable()
      }
    })
  }
}

/**
 * Populate a fresh table with stdio (guest 0/1/2 -> host 0/1/2) and the preopened directories, in
 * `preopens` order from guest fd 3, like `node:wasi`. Call once, on the main thread, before the
 * module starts.
 *
 * @param {SharedArrayBuffer} buffer
 * @param {Record<string, string>} preopens guest path -> host path
 */
export function initializeSharedFdTable(buffer, preopens) {
  const table = new SharedFdTable(buffer)
  for (const hostFd of [0, 1, 2]) {
    let filetype = FILETYPE.UNKNOWN
    try {
      filetype = filetypeOf(fs.fstatSync(hostFd))
    } catch {
      // A closed stdio stream still occupies its guest fd; I/O on it reports the host error.
    }
    table.insert({
      at: hostFd,
      hostFd,
      filetype,
      fdflags: 0,
      rightsBase: RIGHTS.ALL,
      rightsInheriting: RIGHTS.ALL,
    })
  }
  for (const [guestName, hostPath] of Object.entries(preopens)) {
    const realPath = fs.realpathSync(hostPath)
    const hostFd = fs.openSync(
      realPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
    )
    const stats = fs.fstatSync(hostFd, { bigint: true })
    table.insert({
      hostFd,
      filetype: FILETYPE.DIRECTORY,
      fdflags: 0,
      rightsBase: RIGHTS.ALL,
      rightsInheriting: RIGHTS.ALL,
      dir: { hostPath: realPath, guestName, dev: stats.dev, ino: stats.ino },
      preopen: true,
    })
  }
}

/**
 * Build the filesystem `wasi_snapshot_preview1` imports for one thread. Merge them over the thread's
 * own `node:wasi` imports; `localImports` supplies the clock-only `poll_oneoff`.
 *
 * @param {{ buffer: SharedArrayBuffer, memory: WebAssembly.Memory, localImports: Record<string, Function> }} options
 */
export function createFsImports({ buffer, memory, localImports }) {
  const table = new SharedFdTable(buffer)

  // Shared memory can grow; take fresh views per call.
  const view = () => new DataView(memory.buffer)
  const bytes = (ptr, len) => new Uint8Array(memory.buffer, ptr, len)
  const readString = (ptr, len) => Buffer.from(bytes(ptr, len)).toString()

  const iovecs = (iovsPtr, iovsLen) => {
    const dv = view()
    const buffers = []
    for (let i = 0; i < iovsLen; i++) {
      const ptr = dv.getUint32(iovsPtr + i * 8, true)
      const len = dv.getUint32(iovsPtr + i * 8 + 4, true)
      if (len > 0) buffers.push(bytes(ptr, len))
    }
    return buffers
  }

  const writeFilestat = (ptr, stats) => {
    // Zero the padding after `filetype` too.
    bytes(ptr, FILESTAT_SIZE).fill(0)
    const dv = view()
    dv.setBigUint64(ptr, BigInt.asUintN(64, stats.dev), true)
    dv.setBigUint64(ptr + 8, BigInt.asUintN(64, stats.ino), true)
    dv.setUint8(ptr + 16, filetypeOf(stats))
    dv.setBigUint64(ptr + 24, BigInt.asUintN(64, stats.nlink), true)
    dv.setBigUint64(ptr + 32, BigInt.asUintN(64, stats.size), true)
    dv.setBigUint64(ptr + 40, BigInt.asUintN(64, stats.atimeNs), true)
    dv.setBigUint64(ptr + 48, BigInt.asUintN(64, stats.mtimeNs), true)
    dv.setBigUint64(ptr + 56, BigInt.asUintN(64, stats.ctimeNs), true)
  }

  const seekable = (entry) =>
    entry.filetype === FILETYPE.REGULAR_FILE ||
    entry.filetype === FILETYPE.BLOCK_DEVICE

  /**
   * Run `body(entry)` for a call that uses the fd's shared offset. Seekable fds hold their I/O lock
   * for the duration, with the entry re-read under it; other fds have no shared offset and never
   * take it, so (for example) a read blocked on a FIFO holds nothing.
   */
  const withOffset = (fd, body) => {
    const first = table.get(fd)
    if (!seekable(first)) return body(first)
    // The entry may have been closed or replaced while this call waited for the lock; then the fd
    // the guest named is gone, which is `EBADF`, not a reason to use whatever now has its number.
    return table.withIo([fd], () => body(table.same(first)))
  }

  /** The directory record behind `fd`, after checking its path still names the same directory. */
  const directory = (fd) => {
    const entry = table.get(fd)
    if (!entry.dirInfo) fail(ERRNO.NOTDIR)
    const info = entry.dirInfo
    const current = fs.statSync(info.hostPath, {
      bigint: true,
      throwIfNoEntry: false,
    })
    if (!current || current.dev !== info.dev || current.ino !== info.ino) {
      fail(ERRNO.NOENT)
    }
    return info
  }

  const components = (text) =>
    text.split('/').filter((part) => part !== '' && part !== '.')

  /**
   * Resolve a guest path relative to directory fd `fd` to a host path inside that directory.
   *
   * Walks the components in order, like the OS: a symlink is expanded where it appears, so a later
   * `..` applies to the directory reached through it. The directory reached so far is always a real
   * (symlink-free) host path inside the base, so `..` is its parent and stepping above the base is
   * caught at that point. A final symlink is followed only when `follow` is set (or the path ends in
   * `/`).
   *
   * @returns {{ hostPath: string, trailingSlash: boolean }}
   */
  const resolve = (fd, pathPtr, pathLen, follow) => {
    const { hostPath: base } = directory(fd)
    const guestPath = readString(pathPtr, pathLen)
    if (guestPath.length === 0) fail(ERRNO.NOENT)
    if (guestPath.includes('\0')) fail(ERRNO.INVAL)
    if (guestPath.startsWith('/')) fail(ERRNO.NOTCAPABLE)
    // A trailing `/`, `/.` or `/..` (or a lone `.`/`..`) names a directory: follow a final symlink and
    // insist on a directory, as the OS does (`file/.` is `ENOTDIR`, not `file`).
    const lastRaw = guestPath.slice(guestPath.lastIndexOf('/') + 1)
    const trailingSlash = lastRaw === '' || lastRaw === '.' || lastRaw === '..'
    const followFinal = follow || trailingSlash
    const finish = (hostPath) => {
      if (trailingSlash) {
        const stats = fs.lstatSync(hostPath, { throwIfNoEntry: false })
        if (stats && !stats.isDirectory()) fail(ERRNO.NOTDIR)
      }
      return { hostPath, trailingSlash }
    }

    const queue = components(guestPath)
    let current = base
    let expansions = 0
    while (queue.length > 0) {
      const part = queue.shift()
      if (part === '..') {
        if (current === base) fail(ERRNO.NOTCAPABLE)
        current = path.dirname(current)
        continue
      }
      const candidate = path.join(current, part)
      const last = queue.length === 0
      if (last && !followFinal) return finish(candidate)

      const stats = fs.lstatSync(candidate, { throwIfNoEntry: false })
      if (stats?.isSymbolicLink()) {
        if (++expansions > MAX_SYMLINKS) fail(ERRNO.LOOP)
        const target = fs.readlinkSync(candidate)
        if (path.isAbsolute(target)) {
          // A host-absolute target is only usable if it names a path under the base. The rest of it
          // is walked like any other components, without normalizing `..` ahead of symlinks.
          if (!isInside(base, target)) fail(ERRNO.NOTCAPABLE)
          current = base
          queue.unshift(...components(target.slice(base.length)))
        } else {
          queue.unshift(...components(target))
        }
        continue
      }
      if (last) return finish(candidate)
      if (!stats) fail(ERRNO.NOENT)
      if (!stats.isDirectory()) fail(ERRNO.NOTDIR)
      current = candidate
    }
    return finish(current)
  }

  /** Run `body`, turning any thrown error into a WASI errno. Never throws into wasm. */
  const guard =
    (body) =>
    (...args) => {
      try {
        return body(...args) ?? ERRNO.SUCCESS
      } catch (error) {
        return toErrno(error)
      }
    }

  // One `readv`/`writev` per WASI call, like the native implementation: it either fails having moved
  // nothing, or reports how much it moved, which may be short. The guest retries a short transfer;
  // looping here instead could move some bytes and then fail, losing the count.
  const readInto = (entry, buffers, position) =>
    buffers.length === 0 ? 0 : fs.readvSync(entry.hostFd, buffers, position)

  const writeFrom = (entry, buffers, position) =>
    buffers.length === 0 ? 0 : fs.writevSync(entry.hostFd, buffers, position)

  const setTimes = (flags, atim, mtim, current, apply) => {
    if (
      (flags & FSTFLAGS.ATIM && flags & FSTFLAGS.ATIM_NOW) ||
      (flags & FSTFLAGS.MTIM && flags & FSTFLAGS.MTIM_NOW)
    ) {
      fail(ERRNO.INVAL)
    }
    const now = Date.now() / 1000
    const pick = (setFlag, nowFlag, value, fallback) => {
      if (flags & nowFlag) return now
      if (flags & setFlag) return Number(value) / 1e9
      return Number(fallback()) / 1e9
    }
    apply(
      pick(FSTFLAGS.ATIM, FSTFLAGS.ATIM_NOW, atim, () => current().atimeNs),
      pick(FSTFLAGS.MTIM, FSTFLAGS.MTIM_NOW, mtim, () => current().mtimeNs)
    )
  }

  const pollFd = (fd, type) => {
    let entry
    try {
      entry = table.get(fd)
    } catch (error) {
      return { error: toErrno(error), nbytes: 0n }
    }
    if (
      entry.filetype !== FILETYPE.REGULAR_FILE &&
      entry.filetype !== FILETYPE.DIRECTORY
    ) {
      return { error: ERRNO.NOTSUP, nbytes: 0n }
    }
    // Regular files and directories are always ready, as POSIX `poll` reports them. The byte count
    // is advisory, so it reads the offset without the I/O lock.
    let nbytes = 0n
    if (
      type === EVENTTYPE.FD_READ &&
      entry.filetype === FILETYPE.REGULAR_FILE
    ) {
      try {
        const size = fs.fstatSync(entry.hostFd, { bigint: true }).size
        const remaining = size - table.getOffset(fd)
        nbytes = remaining > 0n ? remaining : 0n
      } catch (error) {
        return { error: toErrno(error), nbytes: 0n }
      }
    }
    return { error: ERRNO.SUCCESS, nbytes }
  }

  return {
    fd_advise: guard((fd) => {
      // Advice has no required effect.
      table.get(fd)
    }),

    fd_allocate: guard((fd) => {
      table.get(fd)
      // Node cannot reserve space, and growing the file instead would change its size.
      fail(ERRNO.NOTSUP)
    }),

    fd_close: guard((fd) => {
      const hostFd = table.remove(fd)
      if (hostFd > 2) fs.closeSync(hostFd)
    }),

    fd_datasync: guard((fd) => {
      fs.fdatasyncSync(table.get(fd).hostFd)
    }),

    fd_fdstat_get: guard((fd, ptr) => {
      const entry = table.get(fd)
      const dv = view()
      bytes(ptr, FDSTAT_SIZE).fill(0)
      dv.setUint8(ptr, entry.filetype)
      dv.setUint16(ptr + 2, entry.fdflags, true)
      dv.setBigUint64(ptr + 8, entry.rightsBase, true)
      dv.setBigUint64(ptr + 16, entry.rightsInheriting, true)
    }),

    fd_fdstat_set_flags: guard((fd, flags) => {
      // Node cannot change the flags of an open host fd; accept only a no-op change.
      if (table.get(fd).fdflags !== flags) fail(ERRNO.NOTSUP)
    }),

    fd_fdstat_set_rights: guard((fd, base, inheriting) => {
      const entry = table.get(fd)
      // Rights are not enforced, so accepting a reduction would claim a restriction that does not
      // exist. Only a no-op change succeeds.
      if (
        BigInt.asUintN(64, base) !== entry.rightsBase ||
        BigInt.asUintN(64, inheriting) !== entry.rightsInheriting
      ) {
        fail(ERRNO.NOTSUP)
      }
    }),

    fd_filestat_get: guard((fd, ptr) => {
      writeFilestat(ptr, fs.fstatSync(table.get(fd).hostFd, { bigint: true }))
    }),

    fd_filestat_set_size: guard((fd, size) => {
      fs.ftruncateSync(table.get(fd).hostFd, toPosition(size))
    }),

    fd_filestat_set_times: guard((fd, atim, mtim, flags) => {
      const { hostFd } = table.get(fd)
      setTimes(
        flags,
        atim,
        mtim,
        () => fs.fstatSync(hostFd, { bigint: true }),
        (atime, mtime) => fs.futimesSync(hostFd, atime, mtime)
      )
    }),

    fd_pread: guard((fd, iovsPtr, iovsLen, offset, nreadPtr) => {
      const entry = table.get(fd)
      if (!seekable(entry)) fail(ERRNO.SPIPE)
      const read = readInto(entry, iovecs(iovsPtr, iovsLen), toPosition(offset))
      view().setUint32(nreadPtr, read, true)
    }),

    fd_prestat_get: guard((fd, ptr) => {
      const entry = table.get(fd)
      if (!entry.preopen) fail(ERRNO.BADF)
      const dv = view()
      dv.setUint32(ptr, 0, true) // tag 0 = directory, plus padding
      dv.setUint32(ptr + 4, entry.dirInfo.guestName.length, true)
    }),

    fd_prestat_dir_name: guard((fd, ptr, len) => {
      const entry = table.get(fd)
      if (!entry.preopen) fail(ERRNO.BADF)
      const name = entry.dirInfo.guestName
      if (len < name.length) fail(ERRNO.NAMETOOLONG)
      bytes(ptr, name.length).set(name)
    }),

    fd_pwrite: guard((fd, iovsPtr, iovsLen, offset, nwrittenPtr) => {
      const entry = table.get(fd)
      if (!seekable(entry)) fail(ERRNO.SPIPE)
      const written = writeFrom(
        entry,
        iovecs(iovsPtr, iovsLen),
        toPosition(offset)
      )
      view().setUint32(nwrittenPtr, written, true)
    }),

    fd_read: guard((fd, iovsPtr, iovsLen, nreadPtr) =>
      withOffset(fd, (entry) => {
        if (entry.filetype === FILETYPE.DIRECTORY) fail(ERRNO.ISDIR)
        const buffers = iovecs(iovsPtr, iovsLen)
        let read
        if (seekable(entry)) {
          const offset = table.getOffset(fd)
          read = readInto(entry, buffers, toPosition(offset))
          table.setOffset(fd, offset + BigInt(read))
        } else {
          read = readInto(entry, buffers, null)
        }
        view().setUint32(nreadPtr, read, true)
      })
    ),

    fd_readdir: guard((fd, bufPtr, bufLen, cookie, bufusedPtr) => {
      const { hostPath } = directory(fd)
      const entries = fs.readdirSync(hostPath, { withFileTypes: true })
      let used = 0
      for (
        let i = toPosition(cookie);
        i < entries.length && used < bufLen;
        i++
      ) {
        const dirent = entries[i]
        const name = Buffer.from(dirent.name)
        const ino =
          fs.lstatSync(path.join(hostPath, dirent.name), {
            bigint: true,
            throwIfNoEntry: false,
          })?.ino ?? 0n
        const record = new Uint8Array(DIRENT_SIZE + name.length)
        const dv = new DataView(record.buffer)
        dv.setBigUint64(0, BigInt(i + 1), true)
        dv.setBigUint64(8, BigInt.asUintN(64, ino), true)
        dv.setUint32(16, name.length, true)
        dv.setUint8(20, filetypeOf(dirent))
        record.set(name, DIRENT_SIZE)
        // A record that does not fit is truncated; the guest sees a full buffer and asks again.
        const take = Math.min(record.length, bufLen - used)
        bytes(bufPtr + used, take).set(record.subarray(0, take))
        used += take
      }
      view().setUint32(bufusedPtr, used, true)
    }),

    fd_renumber: guard((from, to) => {
      const hostFd = table.renumber(from, to)
      if (hostFd > 2) fs.closeSync(hostFd)
    }),

    fd_seek: guard((fd, offset, whence, newOffsetPtr) =>
      withOffset(fd, (entry) => {
        if (!seekable(entry)) fail(ERRNO.SPIPE)
        let base
        switch (whence) {
          case WHENCE.SET:
            base = 0n
            break
          case WHENCE.CUR:
            base = table.getOffset(fd)
            break
          case WHENCE.END:
            base = fs.fstatSync(entry.hostFd, { bigint: true }).size
            break
          default:
            fail(ERRNO.INVAL)
        }
        const next = base + BigInt.asIntN(64, offset)
        if (next < 0n) fail(ERRNO.INVAL)
        table.setOffset(fd, checkedOffset(next))
        view().setBigUint64(newOffsetPtr, next, true)
      })
    ),

    fd_sync: guard((fd) => {
      fs.fsyncSync(table.get(fd).hostFd)
    }),

    fd_tell: guard((fd, ptr) =>
      withOffset(fd, (entry) => {
        if (!seekable(entry)) fail(ERRNO.SPIPE)
        view().setBigUint64(ptr, table.getOffset(fd), true)
      })
    ),

    fd_write: guard((fd, iovsPtr, iovsLen, nwrittenPtr) =>
      withOffset(fd, (entry) => {
        if (entry.filetype === FILETYPE.DIRECTORY) fail(ERRNO.ISDIR)
        const buffers = iovecs(iovsPtr, iovsLen)
        let written
        if (!seekable(entry)) {
          written = writeFrom(entry, buffers, null)
        } else if (entry.fdflags & FDFLAGS.APPEND) {
          // The host fd is `O_APPEND`, so the kernel picks the position.
          written = writeFrom(entry, buffers, null)
          table.setOffset(
            fd,
            checkedOffset(fs.fstatSync(entry.hostFd, { bigint: true }).size)
          )
        } else {
          const offset = table.getOffset(fd)
          written = writeFrom(entry, buffers, toPosition(offset))
          table.setOffset(fd, offset + BigInt(written))
        }
        view().setUint32(nwrittenPtr, written, true)
      })
    ),

    path_create_directory: guard((fd, pathPtr, pathLen) => {
      fs.mkdirSync(resolve(fd, pathPtr, pathLen, false).hostPath)
    }),

    path_filestat_get: guard((fd, flags, pathPtr, pathLen, ptr) => {
      const { hostPath } = resolve(
        fd,
        pathPtr,
        pathLen,
        (flags & LOOKUP_SYMLINK_FOLLOW) !== 0
      )
      // `resolve` already followed a final symlink if asked, so never follow it again here.
      writeFilestat(ptr, fs.lstatSync(hostPath, { bigint: true }))
    }),

    path_filestat_set_times: guard(
      (fd, flags, pathPtr, pathLen, atim, mtim, fstFlags) => {
        const { hostPath } = resolve(
          fd,
          pathPtr,
          pathLen,
          (flags & LOOKUP_SYMLINK_FOLLOW) !== 0
        )
        setTimes(
          fstFlags,
          atim,
          mtim,
          () => fs.lstatSync(hostPath, { bigint: true }),
          (atime, mtime) => fs.lutimesSync(hostPath, atime, mtime)
        )
      }
    ),

    path_link: guard(
      (oldFd, oldFlags, oldPtr, oldLen, newFd, newPtr, newLen) => {
        const source = resolve(
          oldFd,
          oldPtr,
          oldLen,
          (oldFlags & LOOKUP_SYMLINK_FOLLOW) !== 0
        ).hostPath
        fs.linkSync(source, resolve(newFd, newPtr, newLen, false).hostPath)
      }
    ),

    path_open: guard(
      (
        fd,
        dirflags,
        pathPtr,
        pathLen,
        oflags,
        rightsBase,
        rightsInheriting,
        fdflags,
        fdPtr
      ) => {
        rightsBase = BigInt.asUintN(64, rightsBase)
        rightsInheriting = BigInt.asUintN(64, rightsInheriting)
        const { hostPath, trailingSlash } = resolve(
          fd,
          pathPtr,
          pathLen,
          (dirflags & LOOKUP_SYMLINK_FOLLOW) !== 0
        )

        const { constants } = fs
        const wantsDirectory =
          (oflags & OFLAGS.DIRECTORY) !== 0 || trailingSlash
        const write =
          !wantsDirectory &&
          ((rightsBase & WRITE_RIGHTS) !== 0n ||
            (fdflags & FDFLAGS.APPEND) !== 0 ||
            (oflags & OFLAGS.TRUNC) !== 0)
        const read = (rightsBase & READ_RIGHTS) !== 0n || !write
        let flags = write
          ? read
            ? constants.O_RDWR
            : constants.O_WRONLY
          : constants.O_RDONLY
        if (oflags & OFLAGS.CREAT) flags |= constants.O_CREAT
        if (oflags & OFLAGS.EXCL) flags |= constants.O_EXCL
        if (oflags & OFLAGS.TRUNC) flags |= constants.O_TRUNC
        if (wantsDirectory) flags |= constants.O_DIRECTORY
        if (fdflags & FDFLAGS.APPEND) flags |= constants.O_APPEND
        if (fdflags & FDFLAGS.NONBLOCK) flags |= constants.O_NONBLOCK
        if (fdflags & FDFLAGS.DSYNC) flags |= constants.O_DSYNC ?? 0
        if (fdflags & (FDFLAGS.SYNC | FDFLAGS.RSYNC)) flags |= constants.O_SYNC
        // `resolve` already followed a final symlink if allowed; refuse to follow one that appears now.
        flags |= constants.O_NOFOLLOW

        const hostFd = fs.openSync(hostPath, flags, 0o666)
        let guestFd
        try {
          const stats = fs.fstatSync(hostFd, { bigint: true })
          const filetype = filetypeOf(stats)
          guestFd = table.insert({
            hostFd,
            filetype,
            fdflags,
            rightsBase,
            rightsInheriting,
            dir:
              filetype === FILETYPE.DIRECTORY
                ? { hostPath, dev: stats.dev, ino: stats.ino }
                : undefined,
          })
        } catch (error) {
          fs.closeSync(hostFd)
          throw error
        }
        view().setUint32(fdPtr, guestFd, true)
      }
    ),

    path_readlink: guard((fd, pathPtr, pathLen, bufPtr, bufLen, usedPtr) => {
      const { hostPath } = resolve(fd, pathPtr, pathLen, false)
      const target = fs.readlinkSync(hostPath, { encoding: 'buffer' })
      const take = Math.min(target.length, bufLen)
      bytes(bufPtr, take).set(target.subarray(0, take))
      view().setUint32(usedPtr, take, true)
    }),

    path_remove_directory: guard((fd, pathPtr, pathLen) => {
      fs.rmdirSync(resolve(fd, pathPtr, pathLen, false).hostPath)
    }),

    path_rename: guard((oldFd, oldPtr, oldLen, newFd, newPtr, newLen) => {
      fs.renameSync(
        resolve(oldFd, oldPtr, oldLen, false).hostPath,
        resolve(newFd, newPtr, newLen, false).hostPath
      )
    }),

    path_symlink: guard((oldPtr, oldLen, fd, newPtr, newLen) => {
      const target = readString(oldPtr, oldLen)
      // A link target is guest data; an absolute one would point outside the guest's namespace.
      if (target.startsWith('/')) fail(ERRNO.NOTCAPABLE)
      fs.symlinkSync(target, resolve(fd, newPtr, newLen, false).hostPath)
    }),

    path_unlink_file: guard((fd, pathPtr, pathLen) => {
      fs.unlinkSync(resolve(fd, pathPtr, pathLen, false).hostPath)
    }),

    poll_oneoff: guard((inPtr, outPtr, nsubscriptions, neventsPtr) => {
      const dv = view()
      const fdSubscriptions = []
      for (let i = 0; i < nsubscriptions; i++) {
        const sub = inPtr + i * SUBSCRIPTION_SIZE
        const tag = dv.getUint8(sub + 8)
        if (tag === EVENTTYPE.FD_READ || tag === EVENTTYPE.FD_WRITE) {
          fdSubscriptions.push(sub)
        } else if (tag !== EVENTTYPE.CLOCK) {
          fail(ERRNO.INVAL)
        }
      }
      // Clock-only polls (sleeps, timeouts) never touch an fd; `node:wasi` handles them.
      if (fdSubscriptions.length === 0) {
        return localImports.poll_oneoff(
          inPtr,
          outPtr,
          nsubscriptions,
          neventsPtr
        )
      }
      // Every fd event is reported immediately, so clock subscriptions never fire alongside them.
      fdSubscriptions.forEach((sub, i) => {
        const tag = dv.getUint8(sub + 8)
        const { error, nbytes } = pollFd(dv.getUint32(sub + 16, true), tag)
        const event = outPtr + i * EVENT_SIZE
        bytes(event, EVENT_SIZE).fill(0)
        dv.setBigUint64(event, dv.getBigUint64(sub, true), true)
        dv.setUint16(event + 8, error, true)
        dv.setUint8(event + 10, tag)
        dv.setBigUint64(event + 16, nbytes, true)
      })
      dv.setUint32(neventsPtr, fdSubscriptions.length, true)
    }),
  }
}

/**
 * The full `wasi_snapshot_preview1` import namespace for one thread: its own `node:wasi` imports
 * with every filesystem function replaced by the shared-table implementation.
 *
 * @param {{ buffer: SharedArrayBuffer, memory: WebAssembly.Memory, wasi: import('node:wasi').WASI }} options
 */
export function createPreview1Imports({ buffer, memory, wasi }) {
  const localImports = wasi.getImportObject().wasi_snapshot_preview1
  return {
    ...localImports,
    ...createFsImports({ buffer, memory, localImports }),
  }
}
