#!/usr/bin/env node
// @ts-check

const { execSync } = require('child_process')

;(async function () {
  const target = process.argv[process.argv.length - 1]

  const turboResult = execSync(
    `pnpm turbo run cache-build-native --dry=json -- ${target}`
  ).toString()

  const turboData = JSON.parse(turboResult)

  const task = turboData.tasks.find((t) => t.command !== '<NONEXISTENT>')

  if (!task) {
    console.warn(`Failed to find related turbo task`, turboResult)
    return
  }

  // pull cache if it was available
  if (task.cache.local || task.cache.remote) {
    const pullResult = execSync(
      `pnpm turbo run cache-build-native -- ${target}`
    ).toString()
    console.log(pullResult)
  } else {
    console.warn(`No turbo cache was available, continuing...`)
    console.warn(task)
  }
})()
