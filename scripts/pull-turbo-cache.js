#!/usr/bin/env node
// @ts-check

const { spawn } = require('child_process')

;(async function () {
  const target = process.argv[process.argv.length - 1]

  let turboResult = ''

  await new Promise((resolve, reject) => {
    const child = spawn(
      '/bin/bash',
      ['-c', `pnpm turbo run cache-build-native --dry=json -- ${target}`],
      {
        stdio: 'pipe',
      }
    )

    child.stdout.on('data', (data) => {
      turboResult += data.toString()
    })

    child.on('exit', (code, signal) => {
      if (code || signal) {
        return reject(
          new Error(`invalid exit code ${code} or signal ${signal}`)
        )
      }
      resolve(0)
    })
  })

  const turboData = JSON.parse(turboResult)

  const task = turboData.tasks.find((t) => t.command !== '<NONEXISTENT>')

  if (!task) {
    console.warn(`Failed to find related turbo task`, turboResult)
    return
  }

  // pull cache if it was available
  if (task.cache.local || task.cache.remote) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        '/bin/bash',
        ['-c', `pnpm turbo run cache-build-native -- ${target}`],
        {
          stdio: 'inherit',
        }
      )
      child.on('exit', (code, signal) => {
        if (code || signal) {
          return reject(
            new Error(`invalid exit code ${code} or signal ${signal}`)
          )
        }
        resolve(0)
      })
    })
  } else {
    console.warn(`No turbo cache was available, continuing...`)
    console.warn(task)
  }
})()
