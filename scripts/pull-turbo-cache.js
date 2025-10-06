#!/usr/bin/env node
// @ts-check

const { spawn } = require('child_process')

;(async function () {
  const target = process.argv[process.argv.length - 1]

  let turboResult = ''
  const turboCommand = `pnpm dlx turbo@${process.env.TURBO_VERSION || 'latest'}`

  await new Promise((resolve, reject) => {
    const child = spawn(
      '/bin/bash',
      ['-c', `${turboCommand} run cache-build-native --dry=json -- ${target}`],
      {
        stdio: 'pipe',
      }
    )

    child.stderr.on('data', (data) => {
      process.stderr.write(data)
    })

    child.stdout.on('data', (data) => {
      process.stdout.write(data)
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
    console.log('Cache Status', task.taskId, task.hash, task.cache)
    await new Promise((resolve, reject) => {
      const child = spawn(
        '/bin/bash',
        ['-c', `${turboCommand} run cache-build-native -- ${target}`],
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
