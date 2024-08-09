#!/usr/bin/env node

const { NEXT_DIR, booleanArg, execAsyncWithOutput } = require('./pack-util.cjs')
const { rmSync } = require('fs')
const path = require('path')

const args = process.argv.slice(2)

// strip --no-build when called from pack-next.cjs
booleanArg(args, '--no-build')

const targetDir = path.join(NEXT_DIR, 'target')

module.exports = (async () => {
  for (let i = 0; i < 2; i++) {
    try {
      await execAsyncWithOutput(
        'Build native modules',
        ['pnpm', 'run', 'swc-build-native', '--', ...args],
        {
          shell: process.platform === 'win32' ? 'powershell.exe' : false,
          env: {
            COLOR: 'always',
            TTY: '1',
            ...process.env,
          },
        }
      )
    } catch (e) {
      if (
        e.stderr
          .toString()
          .includes('the compiler unexpectedly panicked. this is a bug.')
      ) {
        rmSync(path.join(targetDir, 'release/incremental'), {
          recursive: true,
          force: true,
        })
        rmSync(path.join(targetDir, 'debug/incremental'), {
          recursive: true,
          force: true,
        })
        continue
      }
      delete e.stdout
      delete e.stderr
      throw e
    }
    break
  }
})()
