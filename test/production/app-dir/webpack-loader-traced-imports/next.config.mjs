import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Counts Turbopack's Node.js loader processes that are still running. They are
 * children of the build process, so this only sees this build's processes.
 */
function countLoaderProcesses() {
  try {
    return execFileSync('ps', ['-A', '-ww', '-o', 'ppid=,command='], {
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter(
        (match) =>
          match &&
          Number(match[1]) === process.pid &&
          match[2].includes('[turbopack-node]')
      ).length
  } catch {
    // `ps` isn't available, e.g. on Windows.
    return 'unknown'
  }
}

export default {
  turbopack: {
    rules: {
      '*.tsx': {
        loaders: [path.join(dirname, 'loader.js')],
      },
    },
  },
  compiler: {
    async runAfterProductionCompile({ distDir }) {
      await fs.writeFile(
        path.join(distDir, 'loader-processes.txt'),
        String(countLoaderProcesses())
      )
    },
  },
}
