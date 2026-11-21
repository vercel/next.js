import fs from 'fs'
import path from 'path'
import type { NextConfig } from 'next'

const deferredValueFile = path.join(__dirname, 'app', 'deferred', 'value.ts')
const callbackLogFile = path.join(__dirname, '.callback-log')
// Created by the test to make the callback fail with this error.
const throwMarkerFile = path.join(__dirname, '.callback-throws')

function currentProcess() {
  return process.env.NEXT_PRIVATE_TURBOPACK_BUILD_WORKER
    ? 'build-worker'
    : 'main'
}

export default function config(): NextConfig {
  // Set when `next build` calls `generateBuildId` of this evaluation of the
  // config. The callback checks it to make sure it runs on the config that
  // `next build` loaded, not on a config that was loaded again.
  let usedForBuild = false

  return {
    generateBuildId: async () => {
      usedForBuild = true
      return null
    },
    experimental: {
      turbopackBuildWorker: true,
      deferredEntries: ['/deferred'],
      onBeforeDeferredEntries: async () => {
        if (fs.existsSync(throwMarkerFile)) {
          const thrown = fs.readFileSync(throwMarkerFile, 'utf8')
          throw thrown === 'undefined' ? undefined : new Error(thrown)
        }
        fs.appendFileSync(
          callbackLogFile,
          `${currentProcess()} ${usedForBuild ? 'build-config' : 'other-config'}\n`
        )
        // The deferred entry is compiled after this callback, so it sees this
        // value.
        fs.writeFileSync(
          deferredValueFile,
          `export const value = ${JSON.stringify(`written-by-${currentProcess()}`)}\n`
        )
      },
    },
  }
}
