import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Counts Turbopack's Node.js loader processes that are still running. They are
 * children of the build process, so this only sees this build's processes.
 */
function countLoaderProcesses() {
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
}

/**
 * Waits for the loader processes to exit. They exit shortly after compilation
 * rather than at once (e.g. while Turbopack shuts down), so this polls with a
 * deadline. Returns the number of processes still running at the end.
 */
async function waitForLoaderProcessesToExit() {
  const deadline = Date.now() + 10_000
  let count = countLoaderProcesses()
  while (count > 0 && Date.now() < deadline) {
    await setTimeout(100)
    count = countLoaderProcesses()
  }
  return count
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
      let result
      try {
        result = String(await waitForLoaderProcessesToExit())
      } catch {
        // `ps` isn't available, e.g. on Windows.
        result = 'unknown'
      }
      await fs.writeFile(path.join(distDir, 'loader-processes.txt'), result)
    },
  },
}
