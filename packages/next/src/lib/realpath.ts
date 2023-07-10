import fs from 'fs'

const isWindows = process.platform === 'win32'

// Interesting learning from this, that fs.realpathSync is 70x slower than fs.realpathSync.native:
// https://sun0day.github.io/blog/vite/why-vite4_3-is-faster.html#fs-realpathsync-issue
// https://github.com/nodejs/node/issues/2680
// However, we can't use fs.realpathSync.native on Windows due to behavior differences.
export const realpathSync = isWindows ? fs.realpathSync : fs.realpathSync.native
