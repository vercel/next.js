#!/usr/bin/env node
// @ts-check

const { execSync } = require('child_process')

;(async function () {
  const turboResult = execSync(
    `pnpm turbo run cache-build-native --dry=json -- --platform --release --target x86_64-unknown-freebsd`
  ).toString()

  const turboData = JSON.parse(turboResult)

  const task = turboData.tasks.find((t) => t.command !== '<NONEXISTENT>')

  if (!task) {
    console.warn(`Failed to find related turbo task`, turboResult)
    return
  }

  // pull cache if it was available
  if (task.cacheState.local || task.cacheState.remote) {
    const pullResult = execSync(
      `pnpm turbo run cache-build-native -- --platform --release --target x86_64-unknown-freebsd`
    ).toString()
    console.log(pullResult)
  } else {
    console.warn(`No turbo cache was available, continuing...`)
    console.warn(task)
  }
})()
