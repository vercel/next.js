const { appendFileSync, readFileSync, realpathSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { basename } = require('node:path')
const original = process.dlopen
process.dlopen = function (module, filename, ...args) {
  if (String(filename).endsWith('.node') && String(filename).includes('swc')) {
    const path = realpathSync(filename)
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    if (
      process.env.NEXT_TEST_EXPECT_NATIVE_SHA &&
      sha256 !== process.env.NEXT_TEST_EXPECT_NATIVE_SHA
    ) {
      throw new Error('Unexpected test compiler native hash')
    }
    appendFileSync(
      process.env.NEXT_TEST_NATIVE_AUDIT,
      JSON.stringify({
        pid: process.pid,
        process: basename(process.argv[1]),
        path,
        sha256,
      }) + '\n'
    )
  }
  return original.call(this, module, filename, ...args)
}
