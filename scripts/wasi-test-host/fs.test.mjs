/**
 * Tests for the shared-fd-table filesystem imports in ./fs.mjs.
 *
 *   node --test scripts/wasi-test-host/*.test.mjs
 *
 * The imports are driven directly over a shared `WebAssembly.Memory`, from the main thread and from
 * Workers, without a wasm module: that is exactly how the host calls them, minus the guest code.
 * This file doubles as the Worker body (see the bottom), so the tests and the helper stay together.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads'

import {
  createFsImports,
  createSharedFdTableBuffer,
  ERRNO,
  FDFLAGS,
  FILETYPE,
  initializeSharedFdTable,
  LOOKUP_SYMLINK_FOLLOW,
  OFLAGS,
  RIGHTS,
} from './fs.mjs'

const PREOPEN_FD = 3
const RECORD_BYTES = 16
const CHURN_FILE_RIGHTS = RIGHTS.FD_READ | RIGHTS.FD_WRITE
const CHURN_DIR_RIGHTS = RIGHTS.FD_READDIR

/** A fixed-size, unique, line-terminated record. */
function recordOf(tag, i) {
  return `${tag}:${i}`.padEnd(RECORD_BYTES - 1, '.') + '\n'
}
const REGION_BYTES = 16_384
const MEMORY_PAGES = 8 // 512 KiB: room for 32 regions

/**
 * A minimal guest: owns a scratch region of the shared memory and calls the imports the way
 * compiled code would, with pointers into that region.
 */
class Guest {
  constructor({ buffer, memory, region, localImports = {} }) {
    this.memory = memory
    this.base = region * REGION_BYTES
    this.imports = createFsImports({ buffer, memory, localImports })
  }

  get dv() {
    return new DataView(this.memory.buffer)
  }

  // Layout of the region: [0, 64) out-params, [64, 128) iovecs, [128, 2048) path, [2048, ...) data.
  get out() {
    return this.base
  }
  get iovs() {
    return this.base + 64
  }
  get pathPtr() {
    return this.base + 128
  }
  get data() {
    return this.base + 2048
  }

  putPath(guestPath) {
    const bytes = Buffer.from(guestPath)
    new Uint8Array(this.memory.buffer, this.pathPtr, bytes.length).set(bytes)
    return [this.pathPtr, bytes.length]
  }

  putIovecs(lengths) {
    let ptr = this.data
    lengths.forEach((len, i) => {
      this.dv.setUint32(this.iovs + i * 8, ptr, true)
      this.dv.setUint32(this.iovs + i * 8 + 4, len, true)
      ptr += len
    })
    return [this.iovs, lengths.length]
  }

  readData(len) {
    return Buffer.from(
      new Uint8Array(this.memory.buffer, this.data, len)
    ).toString()
  }

  open(
    guestPath,
    {
      dirFd = PREOPEN_FD,
      oflags = 0,
      rights = RIGHTS.FD_READ | RIGHTS.FD_WRITE,
      fdflags = 0,
      follow = true,
    } = {}
  ) {
    const errno = this.imports.path_open(
      dirFd,
      follow ? LOOKUP_SYMLINK_FOLLOW : 0,
      ...this.putPath(guestPath),
      oflags,
      rights,
      0n,
      fdflags,
      this.out
    )
    return { errno, fd: errno === 0 ? this.dv.getUint32(this.out, true) : -1 }
  }

  write(fd, ...chunks) {
    const lengths = chunks.map((chunk) => Buffer.byteLength(chunk))
    const iovs = this.putIovecs(lengths)
    new Uint8Array(
      this.memory.buffer,
      this.data,
      lengths.reduce((a, b) => a + b, 0)
    ).set(Buffer.from(chunks.join('')))
    const errno = this.imports.fd_write(fd, ...iovs, this.out)
    return { errno, n: errno === 0 ? this.dv.getUint32(this.out, true) : 0 }
  }

  pwrite(fd, text, offset) {
    const iovs = this.putIovecs([Buffer.byteLength(text)])
    new Uint8Array(this.memory.buffer, this.data, text.length).set(
      Buffer.from(text)
    )
    const errno = this.imports.fd_pwrite(fd, ...iovs, BigInt(offset), this.out)
    return { errno, n: errno === 0 ? this.dv.getUint32(this.out, true) : 0 }
  }

  read(fd, ...lengths) {
    const errno = this.imports.fd_read(fd, ...this.putIovecs(lengths), this.out)
    const n = errno === 0 ? this.dv.getUint32(this.out, true) : 0
    return { errno, text: this.readData(n) }
  }

  pread(fd, len, offset) {
    const errno = this.imports.fd_pread(
      fd,
      ...this.putIovecs([len]),
      BigInt(offset),
      this.out
    )
    const n = errno === 0 ? this.dv.getUint32(this.out, true) : 0
    return { errno, text: this.readData(n) }
  }

  seek(fd, offset, whence) {
    const errno = this.imports.fd_seek(fd, BigInt(offset), whence, this.out)
    return {
      errno,
      offset: errno === 0 ? Number(this.dv.getBigUint64(this.out, true)) : -1,
    }
  }

  tell(fd) {
    const errno = this.imports.fd_tell(fd, this.out)
    return {
      errno,
      offset: errno === 0 ? Number(this.dv.getBigUint64(this.out, true)) : -1,
    }
  }

  sync(fd) {
    return this.imports.fd_sync(fd)
  }

  datasync(fd) {
    return this.imports.fd_datasync(fd)
  }

  close(fd) {
    return this.imports.fd_close(fd)
  }

  filestat(fd) {
    const errno = this.imports.fd_filestat_get(fd, this.out)
    return { errno, ...(errno === 0 ? this.decodeFilestat() : {}) }
  }

  pathFilestat(guestPath, { dirFd = PREOPEN_FD, follow = true } = {}) {
    const errno = this.imports.path_filestat_get(
      dirFd,
      follow ? LOOKUP_SYMLINK_FOLLOW : 0,
      ...this.putPath(guestPath),
      this.out
    )
    return { errno, ...(errno === 0 ? this.decodeFilestat() : {}) }
  }

  fdstat(fd) {
    const errno = this.imports.fd_fdstat_get(fd, this.out)
    if (errno !== 0) return { errno }
    return {
      errno,
      filetype: this.dv.getUint8(this.out),
      rights: this.dv.getBigUint64(this.out + 8, true),
    }
  }

  renumber(from, to) {
    return this.imports.fd_renumber(from, to)
  }

  /** Write `count` 16-byte records `<tag>:<i>` through the shared offset. */
  writeRecords(fd, tag, count) {
    let failures = 0
    for (let i = 0; i < count; i++) {
      const { errno, n } = this.write(fd, recordOf(tag, i))
      if (errno !== 0 || n !== RECORD_BYTES) failures++
    }
    return failures
  }

  /** Read 16-byte records through the shared offset until EOF. */
  readRecords(fd) {
    const records = []
    for (;;) {
      const { errno, text } = this.read(fd, RECORD_BYTES)
      if (errno !== 0) return { errno, records }
      if (text.length === 0) return { errno, records }
      records.push(text)
    }
  }

  /**
   * Repeatedly open a file and a directory with distinctive rights, renumber one onto the other, and
   * close it, so that the same guest fd numbers keep changing meaning.
   */
  churn(iterations) {
    let unexpected = 0
    for (let i = 0; i < iterations; i++) {
      const file = this.open('churn-file', {
        oflags: OFLAGS.CREAT,
        rights: CHURN_FILE_RIGHTS,
      })
      const dir = this.open('churn-dir', {
        oflags: OFLAGS.DIRECTORY,
        rights: CHURN_DIR_RIGHTS,
      })
      if (file.errno !== 0 || dir.errno !== 0) {
        unexpected++
        continue
      }
      const [moved, closed] = i % 2 ? [file.fd, dir.fd] : [dir.fd, file.fd]
      if (this.renumber(moved, closed) !== 0) unexpected++
      if (this.close(closed) !== 0) unexpected++
    }
    return unexpected
  }

  /**
   * Look up fds that `churn` keeps reusing. Every answer must be a whole entry (filetype and rights
   * from the same open) or `EBADF`.
   */
  lookups(fds, iterations) {
    const problems = []
    for (let i = 0; i < iterations; i++) {
      for (const fd of fds) {
        const stat = this.fdstat(fd)
        if (stat.errno === ERRNO.BADF) continue
        const whole =
          stat.errno === 0 &&
          ((stat.filetype === FILETYPE.REGULAR_FILE &&
            stat.rights === CHURN_FILE_RIGHTS) ||
            (stat.filetype === FILETYPE.DIRECTORY &&
              stat.rights === CHURN_DIR_RIGHTS))
        if (!whole) problems.push({ fd, ...stat, rights: String(stat.rights) })
        const tell = this.tell(fd).errno
        if (![0, ERRNO.BADF, ERRNO.SPIPE].includes(tell)) {
          problems.push({ fd, tell })
        }
        const filestat = this.filestat(fd).errno
        if (![0, ERRNO.BADF].includes(filestat)) {
          problems.push({ fd, filestat })
        }
      }
    }
    return problems
  }

  decodeFilestat() {
    const dv = this.dv
    return {
      dev: dv.getBigUint64(this.out, true),
      ino: dv.getBigUint64(this.out + 8, true),
      filetype: dv.getUint8(this.out + 16),
      nlink: dv.getBigUint64(this.out + 24, true),
      size: dv.getBigUint64(this.out + 32, true),
      mtim: dv.getBigUint64(this.out + 48, true),
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Worker body: run `Guest` methods on request, reporting `started` before each call so the parent
// knows the call is in progress even when it blocks.
// ---------------------------------------------------------------------------------------------

if (!isMainThread && workerData?.fsTestWorker) {
  const guest = new Guest(workerData)
  parentPort.on('message', ({ id, method, args }) => {
    parentPort.postMessage({ id, started: true })
    let result
    try {
      result = { value: guest[method](...args) }
    } catch (error) {
      result = { thrown: String(error) }
    }
    parentPort.postMessage({ id, ...result })
  })
}

class GuestWorker {
  static nextRegion = 1

  constructor(shared) {
    this.worker = new Worker(new URL(import.meta.url), {
      workerData: {
        fsTestWorker: true,
        buffer: shared.buffer,
        memory: shared.memory,
        region: GuestWorker.nextRegion++,
      },
      // Same setting as the host: fds opened here must survive this Worker.
      trackUnmanagedFds: false,
    })
    this.nextId = 0
    this.pending = new Map()
    this.worker.on('message', (message) => {
      const entry = this.pending.get(message.id)
      if (!entry) return
      if (message.started) {
        entry.started()
        return
      }
      this.pending.delete(message.id)
      if ('thrown' in message) entry.reject(new Error(message.thrown))
      else entry.resolve(message.value)
    })
  }

  /** Call a `Guest` method; returns `{ started, result }` promises. */
  start(method, ...args) {
    const id = this.nextId++
    let started
    const startedPromise = new Promise((resolve) => (started = resolve))
    const result = new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject, started })
    )
    this.worker.postMessage({ id, method, args })
    return { started: startedPromise, result }
  }

  call(method, ...args) {
    return this.start(method, ...args).result
  }

  async exit() {
    await this.worker.terminate()
  }
}

function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms)
    }),
  ])
}

if (isMainThread) {
  describe('shared fd table', () => {
    let root
    let outside
    let shared
    let main
    const clockPolls = []

    before(() => {
      const tmp = fs.realpathSync(os.tmpdir())
      root = fs.mkdtempSync(path.join(tmp, 'wasi-fs-root-'))
      outside = fs.mkdtempSync(path.join(tmp, 'wasi-fs-outside-'))
      fs.writeFileSync(path.join(outside, 'secret'), 'secret')

      shared = {
        buffer: createSharedFdTableBuffer(),
        memory: new WebAssembly.Memory({
          initial: MEMORY_PAGES,
          maximum: MEMORY_PAGES,
          shared: true,
        }),
      }
      initializeSharedFdTable(shared.buffer, { '/': root })
      main = new Guest({
        ...shared,
        region: 0,
        localImports: {
          poll_oneoff: (...args) => {
            clockPolls.push(args)
            return ERRNO.SUCCESS
          },
        },
      })
    })

    after(() => {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    })

    test('an fd is usable from every Worker, and outlives the one that opened it', async () => {
      const opener = new GuestWorker(shared)
      const { errno, fd } = await opener.call('open', 'cross.txt', {
        oflags: OFLAGS.CREAT | OFLAGS.TRUNC,
      })
      assert.equal(errno, ERRNO.SUCCESS)
      await opener.exit()

      const user = new GuestWorker(shared)
      try {
        assert.deepEqual(await user.call('write', fd, 'hello'), {
          errno: 0,
          n: 5,
        })
        assert.equal(await user.call('sync', fd), ERRNO.SUCCESS)
        assert.equal(await user.call('datasync', fd), ERRNO.SUCCESS)
        assert.deepEqual(await user.call('pread', fd, 16, 0), {
          errno: 0,
          text: 'hello',
        })
        assert.equal(
          fs.readFileSync(path.join(root, 'cross.txt'), 'utf8'),
          'hello'
        )

        // Closed in one Worker: bad everywhere.
        assert.equal(await user.call('close', fd), ERRNO.SUCCESS)
        assert.equal(main.write(fd, 'x').errno, ERRNO.BADF)
        const other = new GuestWorker(shared)
        try {
          assert.equal((await other.call('read', fd, 4)).errno, ERRNO.BADF)
        } finally {
          await other.exit()
        }
      } finally {
        await user.exit()
      }
    })

    test('I/O on one thread does not wait for a blocked call on another', async (t) => {
      if (process.platform === 'win32') {
        t.skip('needs mkfifo')
        return
      }
      const fifo = path.join(root, 'fifo')
      execFileSync('mkfifo', [fifo])

      const reader = new GuestWorker(shared)
      const worker = new GuestWorker(shared)
      let feeder
      try {
        // O_RDWR on a FIFO does not wait for a writer, but a read blocks until data arrives.
        const { errno, fd: fifoFd } = await reader.call('open', 'fifo')
        assert.equal(errno, ERRNO.SUCCESS)

        let readFinished = false
        const read = reader.start('read', fifoFd, 4)
        const readResult = read.result.then((value) => {
          readFinished = true
          return value
        })
        await read.started

        // While `reader` is parked in a blocking read, a full open/write/sync/close cycle completes.
        const cycle = (async () => {
          const opened = await worker.call('open', 'concurrent.txt', {
            oflags: OFLAGS.CREAT,
          })
          assert.equal(opened.errno, ERRNO.SUCCESS)
          assert.equal((await worker.call('write', opened.fd, 'data')).n, 4)
          assert.equal(await worker.call('sync', opened.fd), ERRNO.SUCCESS)
          assert.equal(await worker.call('close', opened.fd), ERRNO.SUCCESS)
        })()
        await withTimeout(cycle, 5_000, 'I/O while another thread is blocked')
        assert.equal(readFinished, false, 'the FIFO read should still block')

        feeder = fs.openSync(fifo, fs.constants.O_WRONLY)
        fs.writeSync(feeder, 'ping')
        assert.deepEqual(await withTimeout(readResult, 5_000, 'FIFO read'), {
          errno: 0,
          text: 'ping',
        })
        assert.equal(await reader.call('close', fifoFd), ERRNO.SUCCESS)
      } finally {
        // A Worker blocked in a read cannot be terminated, so always release the reader, even when
        // the assertions above failed before the FIFO was fed.
        if (feeder === undefined) {
          feeder = fs.openSync(
            fifo,
            fs.constants.O_WRONLY | fs.constants.O_NONBLOCK
          )
          fs.writeSync(feeder, 'stop')
        }
        fs.closeSync(feeder)
        await reader.exit()
        await worker.exit()
      }
    })

    test('struct layouts and errnos match preview1', () => {
      // prestat / prestat_dir_name for the preopen.
      assert.equal(main.imports.fd_prestat_get(PREOPEN_FD, main.out), 0)
      assert.equal(main.dv.getUint8(main.out), 0) // tag: dir
      assert.equal(main.dv.getUint32(main.out + 4, true), 1)
      assert.equal(
        main.imports.fd_prestat_dir_name(PREOPEN_FD, main.pathPtr, 1),
        0
      )
      assert.equal(main.dv.getUint8(main.pathPtr), '/'.charCodeAt(0))
      // The preopen list ends at the first non-preopen fd, as wasi-libc expects.
      assert.equal(
        main.imports.fd_prestat_get(PREOPEN_FD + 1, main.out),
        ERRNO.BADF
      )
      assert.equal(main.imports.fd_prestat_get(1, main.out), ERRNO.BADF)

      // Missing file.
      assert.equal(main.open('missing').errno, ERRNO.NOENT)

      // Scatter/gather iovecs.
      const { fd } = main.open('layout.txt', {
        oflags: OFLAGS.CREAT | OFLAGS.TRUNC,
        rights: RIGHTS.FD_READ | RIGHTS.FD_WRITE | RIGHTS.FD_DATASYNC,
      })
      assert.deepEqual(main.write(fd, 'ab', 'cdef'), { errno: 0, n: 6 })
      assert.equal(main.seek(fd, 0, 0).offset, 0)
      assert.deepEqual(main.read(fd, 2, 10), { errno: 0, text: 'abcdef' })

      // fdstat: filetype u8 @0, flags u16 @2, rights u64 @8, inheriting u64 @16.
      main.dv.setBigUint64(main.out + 16, 0xffn, true)
      assert.equal(main.imports.fd_fdstat_get(fd, main.out), 0)
      assert.equal(main.dv.getUint8(main.out), FILETYPE.REGULAR_FILE)
      assert.equal(main.dv.getUint16(main.out + 2, true), 0)
      assert.equal(
        main.dv.getBigUint64(main.out + 8, true),
        RIGHTS.FD_READ | RIGHTS.FD_WRITE | RIGHTS.FD_DATASYNC
      )
      assert.equal(main.dv.getBigUint64(main.out + 16, true), 0n)

      // filestat: dev @0, ino @8, filetype @16, nlink @24, size @32, times @40/48/56.
      const host = fs.statSync(path.join(root, 'layout.txt'), { bigint: true })
      const stat = main.filestat(fd)
      assert.equal(stat.errno, 0)
      assert.equal(stat.dev, host.dev)
      assert.equal(stat.ino, host.ino)
      assert.equal(stat.filetype, FILETYPE.REGULAR_FILE)
      assert.equal(stat.nlink, 1n)
      assert.equal(stat.size, 6n)
      assert.equal(stat.mtim, host.mtimeNs)
      assert.equal(main.close(fd), 0)

      // dirent: d_next u64 @0, d_ino u64 @8, d_namlen u32 @16, d_type u8 @20, then the name.
      fs.mkdirSync(path.join(root, 'listing'))
      fs.writeFileSync(path.join(root, 'listing', 'a'), '')
      fs.mkdirSync(path.join(root, 'listing', 'bb'))
      const dir = main.open('listing', {
        oflags: OFLAGS.DIRECTORY,
        rights: RIGHTS.FD_READDIR,
      })
      assert.equal(dir.errno, 0)
      const readdir = (cookie, len) => {
        const errno = main.imports.fd_readdir(
          dir.fd,
          main.data,
          len,
          BigInt(cookie),
          main.out
        )
        return { errno, used: main.dv.getUint32(main.out, true) }
      }
      const { errno, used } = readdir(0, 1024)
      assert.equal(errno, 0)
      const entries = []
      for (let offset = 0; offset < used; ) {
        const at = main.data + offset
        const namlen = main.dv.getUint32(at + 16, true)
        entries.push({
          next: main.dv.getBigUint64(at, true),
          ino: main.dv.getBigUint64(at + 8, true),
          type: main.dv.getUint8(at + 20),
          name: Buffer.from(
            new Uint8Array(main.memory.buffer, at + 24, namlen)
          ).toString(),
        })
        offset += 24 + namlen
      }
      entries.sort((x, y) => x.name.localeCompare(y.name))
      assert.deepEqual(
        entries.map(({ name, type }) => ({ name, type })),
        [
          { name: 'a', type: FILETYPE.REGULAR_FILE },
          { name: 'bb', type: FILETYPE.DIRECTORY },
        ]
      )
      assert.deepEqual(entries.map((e) => e.next).sort(), [1n, 2n])
      assert.equal(
        entries.find((e) => e.name === 'a').ino,
        fs.statSync(path.join(root, 'listing', 'a'), { bigint: true }).ino
      )
      // A buffer too small for everything comes back full; resuming from a cookie skips entries.
      assert.equal(readdir(0, 30).used, 30)
      assert.equal(readdir(2, 1024).used, 0)
      assert.equal(main.close(dir.fd), 0)
    })

    test('offsets are shared across threads; positioned I/O leaves them alone', async () => {
      const { fd } = main.open('offsets.txt', {
        oflags: OFLAGS.CREAT | OFLAGS.TRUNC,
      })
      assert.equal(main.write(fd, 'abcdef').n, 6)
      const other = new GuestWorker(shared)
      try {
        assert.equal((await other.call('tell', fd)).offset, 6)
        assert.equal((await other.call('seek', fd, 0, 0)).offset, 0)
        assert.deepEqual(await other.call('read', fd, 3), {
          errno: 0,
          text: 'abc',
        })
        assert.equal(main.tell(fd).offset, 3)

        assert.deepEqual(main.pread(fd, 16, 0), { errno: 0, text: 'abcdef' })
        assert.equal(main.pwrite(fd, 'X', 0).n, 1)
        assert.equal((await other.call('tell', fd)).offset, 3)

        assert.deepEqual(await other.call('read', fd, 16), {
          errno: 0,
          text: 'def',
        })
        assert.equal(main.seek(fd, -2, 2).offset, 4) // END
        assert.equal(main.seek(fd, 1, 1).offset, 5) // CUR
        assert.equal(main.seek(fd, -10, 1).errno, ERRNO.INVAL)
        assert.equal(
          fs.readFileSync(path.join(root, 'offsets.txt'), 'utf8'),
          'Xbcdef'
        )
      } finally {
        await other.exit()
        main.close(fd)
      }

      // Appending ignores the offset for writes but reports the end afterwards.
      const appended = main.open('offsets.txt', { fdflags: FDFLAGS.APPEND })
      assert.equal(appended.errno, 0)
      assert.equal(main.write(appended.fd, 'gh').n, 2)
      assert.equal(main.tell(appended.fd).offset, 8)
      main.close(appended.fd)
      assert.equal(
        fs.readFileSync(path.join(root, 'offsets.txt'), 'utf8'),
        'Xbcdefgh'
      )
    })

    test('paths cannot escape the directory fd', () => {
      fs.writeFileSync(path.join(root, 'inside.txt'), 'inside')
      fs.mkdirSync(path.join(root, 'sub'))
      fs.symlinkSync(outside, path.join(root, 'out-dir'))
      fs.symlinkSync(path.join(outside, 'secret'), path.join(root, 'out-file'))
      fs.symlinkSync('../inside.txt', path.join(root, 'sub', 'up-inside'))
      fs.symlinkSync('../../', path.join(root, 'sub', 'up-escape'))

      // Absolute and lexical `..` escapes.
      assert.equal(main.open('/etc/passwd').errno, ERRNO.NOTCAPABLE)
      assert.equal(main.open('../inside.txt').errno, ERRNO.NOTCAPABLE)
      assert.equal(main.open('sub/../../x').errno, ERRNO.NOTCAPABLE)
      // `..` that stays inside is fine.
      assert.equal(main.pathFilestat('sub/../inside.txt').errno, 0)

      // A symlink in an intermediate component.
      assert.equal(main.open('out-dir/secret').errno, ERRNO.NOTCAPABLE)
      assert.equal(main.open('sub/up-escape/x').errno, ERRNO.NOTCAPABLE)
      // A followed final symlink.
      assert.equal(main.open('out-file').errno, ERRNO.NOTCAPABLE)
      assert.equal(main.pathFilestat('out-dir').errno, ERRNO.NOTCAPABLE)
      // Not following it is fine: it is the link itself, inside the tree.
      assert.equal(
        main.pathFilestat('out-file', { follow: false }).filetype,
        FILETYPE.SYMBOLIC_LINK
      )
      assert.equal(main.open('out-file', { follow: false }).errno, ERRNO.LOOP)
      // Symlinks that stay inside resolve.
      const inside = main.open('sub/up-inside', { rights: RIGHTS.FD_READ })
      assert.equal(inside.errno, 0)
      assert.equal(main.read(inside.fd, 16).text, 'inside')
      main.close(inside.fd)

      // Confinement is relative to the directory fd, not the preopen.
      const sub = main.open('sub', { oflags: OFLAGS.DIRECTORY, rights: 0n })
      assert.equal(sub.errno, 0)
      assert.equal(
        main.pathFilestat('../inside.txt', { dirFd: sub.fd }).errno,
        ERRNO.NOTCAPABLE
      )
      assert.equal(
        main.pathFilestat('up-inside', { dirFd: sub.fd }).errno,
        ERRNO.NOTCAPABLE
      )

      // Symlinks created by the guest cannot be absolute.
      const [target, targetLen] = main.putPath('/etc')
      const linkName = Buffer.from('abs-link')
      new Uint8Array(main.memory.buffer, main.data, linkName.length).set(
        linkName
      )
      assert.equal(
        main.imports.path_symlink(
          target,
          targetLen,
          PREOPEN_FD,
          main.data,
          linkName.length
        ),
        ERRNO.NOTCAPABLE
      )

      // A renamed directory fd fails instead of resolving against whatever now has its path.
      fs.renameSync(path.join(root, 'sub'), path.join(root, 'sub-moved'))
      fs.mkdirSync(path.join(root, 'sub'))
      assert.equal(main.pathFilestat('.', { dirFd: sub.fd }).errno, ERRNO.NOENT)
      assert.equal(main.open('x', { dirFd: sub.fd }).errno, ERRNO.NOENT)
      // Non-path operations on it still work: the host fd is still the original directory.
      assert.equal(main.filestat(sub.fd).filetype, FILETYPE.DIRECTORY)
      assert.equal(main.close(sub.fd), 0)
    })

    test('path operations create, rename and remove entries', () => {
      const [dirPtr, dirLen] = main.putPath('made')
      assert.equal(
        main.imports.path_create_directory(PREOPEN_FD, dirPtr, dirLen),
        0
      )
      assert.ok(fs.statSync(path.join(root, 'made')).isDirectory())

      const { fd } = main.open('made/f', { oflags: OFLAGS.CREAT })
      main.close(fd)
      const oldName = main.putPath('made/f')
      const newName = Buffer.from('made/g')
      new Uint8Array(main.memory.buffer, main.data, newName.length).set(newName)
      assert.equal(
        main.imports.path_rename(
          PREOPEN_FD,
          ...oldName,
          PREOPEN_FD,
          main.data,
          newName.length
        ),
        0
      )
      assert.ok(fs.existsSync(path.join(root, 'made', 'g')))
      assert.equal(
        main.imports.path_unlink_file(PREOPEN_FD, ...main.putPath('made/g')),
        0
      )
      assert.equal(
        main.imports.path_remove_directory(PREOPEN_FD, ...main.putPath('made')),
        0
      )
      assert.equal(fs.existsSync(path.join(root, 'made')), false)
      assert.equal(
        main.imports.path_remove_directory(PREOPEN_FD, ...main.putPath('made')),
        ERRNO.NOENT
      )
    })

    test('unsupported or invalid calls return an errno instead of throwing', (t) => {
      const { fd } = main.open('flags.txt', { oflags: OFLAGS.CREAT })
      // Node cannot change the flags of an open fd.
      assert.equal(main.imports.fd_fdstat_set_flags(fd, 0), 0)
      assert.equal(
        main.imports.fd_fdstat_set_flags(fd, FDFLAGS.NONBLOCK),
        ERRNO.NOTSUP
      )
      // Rights are reported, not enforced, so the shim refuses to pretend it changed them.
      const rights = RIGHTS.FD_READ | RIGHTS.FD_WRITE
      assert.equal(main.imports.fd_fdstat_set_rights(fd, rights, 0n), 0)
      assert.equal(
        main.imports.fd_fdstat_set_rights(fd, RIGHTS.FD_READ, 0n),
        ERRNO.NOTSUP
      )
      assert.equal(
        main.imports.fd_fdstat_set_rights(fd, RIGHTS.ALL, 0n),
        ERRNO.NOTSUP
      )
      assert.equal(main.fdstat(fd).rights, rights)
      // Node cannot reserve space; faking it by truncating would change the file size.
      assert.equal(main.imports.fd_allocate(fd, 0n, 4096n), ERRNO.NOTSUP)
      assert.equal(main.filestat(fd).size, 0n)
      // Offsets beyond what JS numbers can carry exactly are rejected, not rounded.
      assert.equal(main.seek(fd, 2 ** 53, 0).errno, ERRNO.OVERFLOW)
      assert.equal(main.pread(fd, 4, 2 ** 60).errno, ERRNO.INVAL)
      // Out-of-range fds and pointers.
      assert.equal(main.imports.fd_close(1 << 30), ERRNO.BADF)
      assert.equal(main.imports.fd_close(-1), ERRNO.BADF)
      assert.equal(
        main.imports.fd_write(fd, 0x7fff_fff0, 1, main.out),
        ERRNO.INVAL
      )
      main.close(fd)

      // poll_oneoff: clock-only goes to the thread-local implementation.
      const dv = main.dv
      const sub = main.data
      new Uint8Array(main.memory.buffer, sub, 96).fill(0)
      dv.setUint8(sub + 8, 0) // clock
      assert.equal(
        main.imports.poll_oneoff(sub, main.out, 1, main.base + 40),
        0
      )
      assert.equal(clockPolls.length, 1)

      // An fd subscription on a regular file is ready right away; one on a FIFO is NOTSUP.
      const file = main.open('inside.txt', { rights: RIGHTS.FD_READ })
      dv.setBigUint64(sub, 7n, true) // userdata
      dv.setUint8(sub + 8, 1) // fd_read
      dv.setUint32(sub + 16, file.fd, true)
      const events = main.data + 512
      assert.equal(main.imports.poll_oneoff(sub, events, 1, main.base + 40), 0)
      assert.equal(dv.getUint32(main.base + 40, true), 1)
      assert.equal(dv.getBigUint64(events, true), 7n)
      assert.equal(dv.getUint16(events + 8, true), 0)
      assert.equal(dv.getUint8(events + 10), 1)
      assert.equal(dv.getBigUint64(events + 16, true), 6n) // bytes left to read
      main.close(file.fd)
      assert.equal(clockPolls.length, 1)

      if (process.platform !== 'win32') {
        const fifo = main.open('fifo', {
          rights: RIGHTS.FD_READ | RIGHTS.FD_WRITE,
        })
        assert.equal(fifo.errno, 0)
        dv.setUint32(sub + 16, fifo.fd, true)
        assert.equal(
          main.imports.poll_oneoff(sub, events, 1, main.base + 40),
          0
        )
        assert.equal(dv.getUint16(events + 8, true), ERRNO.NOTSUP)
        main.close(fifo.fd)
      } else {
        t.diagnostic('FIFO poll check skipped on Windows')
      }

      // A bad subscription tag is rejected as a whole.
      dv.setUint8(sub + 8, 9)
      assert.equal(
        main.imports.poll_oneoff(sub, events, 1, main.base + 40),
        ERRNO.INVAL
      )
    })

    /** Run `method` on `count` Workers at once and collect their results. */
    async function onWorkers(count, method, argsFor) {
      const workers = Array.from(
        { length: count },
        () => new GuestWorker(shared)
      )
      try {
        return await withTimeout(
          Promise.all(workers.map((w, i) => w.call(method, ...argsFor(i)))),
          60_000,
          method
        )
      } finally {
        await Promise.all(workers.map((w) => w.exit()))
      }
    }

    const WORKERS = 4
    const RECORDS = 500

    function expectedRecords() {
      const all = []
      for (let w = 0; w < WORKERS; w++) {
        for (let i = 0; i < RECORDS; i++) all.push(recordOf(w, i))
      }
      return all.sort()
    }

    function recordsIn(text) {
      const records = []
      for (let at = 0; at < text.length; at += RECORD_BYTES) {
        records.push(text.slice(at, at + RECORD_BYTES))
      }
      return records.sort()
    }

    async function concurrentWrites(append) {
      const { errno, fd } = main.open(`records-${append}.txt`, {
        oflags: OFLAGS.CREAT | OFLAGS.TRUNC,
        fdflags: append ? FDFLAGS.APPEND : 0,
      })
      assert.equal(errno, 0)
      const failures = await onWorkers(WORKERS, 'writeRecords', (i) => [
        fd,
        i,
        RECORDS,
      ])
      assert.deepEqual(failures, Array(WORKERS).fill(0))
      const total = WORKERS * RECORDS * RECORD_BYTES
      assert.equal(main.tell(fd).offset, total)
      main.close(fd)
      const text = fs.readFileSync(
        path.join(root, `records-${append}.txt`),
        'utf8'
      )
      assert.equal(text.length, total)
      assert.deepEqual(recordsIn(text), expectedRecords())
    }

    for (const append of [false, true]) {
      test(`concurrent fd_write on one fd keeps every record (append: ${append})`, () =>
        concurrentWrites(append))
    }

    test('concurrent fd_read on one fd returns every record exactly once', async () => {
      const file = path.join(root, 'records-read.txt')
      fs.writeFileSync(file, expectedRecords().join(''))
      const { errno, fd } = main.open('records-read.txt', {
        rights: RIGHTS.FD_READ,
      })
      assert.equal(errno, 0)
      const results = await onWorkers(WORKERS, 'readRecords', () => [fd])
      for (const result of results) assert.equal(result.errno, 0)
      assert.deepEqual(
        results.flatMap((result) => result.records).sort(),
        expectedRecords()
      )
      assert.equal(main.tell(fd).offset, fs.statSync(file).size)
      main.close(fd)
    })

    test('lookups never see a half-replaced entry while fds are churned', async () => {
      fs.mkdirSync(path.join(root, 'churn-dir'), { recursive: true })
      // Every fd `churn` can produce: the lowest free numbers above everything open right now.
      const probe = main.open('churn-dir', { oflags: OFLAGS.DIRECTORY })
      main.close(probe.fd)
      const fds = Array.from({ length: 8 }, (_, i) => probe.fd + i)
      const churners = Array.from({ length: 2 }, () => new GuestWorker(shared))
      const lookers = Array.from({ length: 2 }, () => new GuestWorker(shared))
      try {
        const [unexpected, problems] = await withTimeout(
          Promise.all([
            Promise.all(churners.map((w) => w.call('churn', 2_000))),
            Promise.all(lookers.map((w) => w.call('lookups', fds, 2_000))),
          ]),
          60_000,
          'churn'
        )
        assert.deepEqual(unexpected, [0, 0])
        assert.deepEqual(problems.flat(), [])
      } finally {
        await Promise.all([...churners, ...lookers].map((w) => w.exit()))
      }
      for (const fd of fds) assert.equal(main.fdstat(fd).errno, ERRNO.BADF)
    })

    test('`..` after a symlink applies to the link target, like the OS', () => {
      fs.mkdirSync(path.join(root, 'deep', 'er'), { recursive: true })
      fs.writeFileSync(path.join(root, 'deep', 'marker'), 'deep')
      fs.symlinkSync('deep/er', path.join(root, 'to-deeper'))
      // `to-deeper/..` is `deep`, not the root.
      const marker = main.open('to-deeper/../marker', {
        rights: RIGHTS.FD_READ,
      })
      assert.equal(marker.errno, 0)
      assert.equal(main.read(marker.fd, 16).text, 'deep')
      main.close(marker.fd)
      assert.equal(main.pathFilestat('to-deeper/../../inside.txt').errno, 0)
      // ...and it is confined like any other `..`: relative to `deep`, `up` leads to the root.
      fs.symlinkSync('..', path.join(root, 'deep', 'up'))
      const deep = main.open('deep', { oflags: OFLAGS.DIRECTORY, rights: 0n })
      assert.equal(
        main.pathFilestat('er/../up/inside.txt', { dirFd: deep.fd }).errno,
        ERRNO.NOTCAPABLE
      )
      assert.equal(
        main.pathFilestat('up/../x', { dirFd: deep.fd }).errno,
        ERRNO.NOTCAPABLE
      )
      main.close(deep.fd)

      // A trailing `/`, `/.` or `/..` names a directory, so a file there is `ENOTDIR`.
      assert.equal(main.pathFilestat('inside.txt/').errno, ERRNO.NOTDIR)
      assert.equal(main.pathFilestat('inside.txt/.').errno, ERRNO.NOTDIR)
      assert.equal(main.open('inside.txt/.').errno, ERRNO.NOTDIR)
      assert.equal(main.pathFilestat('deep/.').filetype, FILETYPE.DIRECTORY)
      assert.equal(
        main.pathFilestat('deep/er/..').ino,
        fs.statSync(path.join(root, 'deep'), { bigint: true }).ino
      )
      // ...and a final symlink is followed to check it.
      assert.equal(
        main.pathFilestat('to-deeper/', { follow: false }).filetype,
        FILETYPE.DIRECTORY
      )
    })
  })
}
