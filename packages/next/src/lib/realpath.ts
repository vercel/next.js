import fs from 'fs'
import { promisify } from 'util'

const isWindows = process.platform === 'win32'

// Interesting learning from this, that fs.realpathSync is 70x slower than fs.realpathSync.native:
// https://sun0day.github.io/blog/vite/why-vite4_3-is-faster.html#fs-realpathsync-issue
// https://github.com/nodejs/node/issues/2680
// However, we can't use fs.realpathSync.native on Windows due to behavior differences.
export const realpathSync = isWindows ? fs.realpathSync : fs.realpathSync.native

// fs.promises.realpath behaves like fs.realpath.native, because it is 70x faster and is preferred
// by the Node.js team: https://github.com/nodejs/node/issues/37737
// Use promisify(fs.realpath) to adapt behavior differences (namely Windows Network Drive behavior).
export const realpath = isWindows
  ? promisify(fs.realpath)
  : fs.promises.realpath
