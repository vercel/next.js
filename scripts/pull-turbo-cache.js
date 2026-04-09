#!/usr/bin/env node
// @ts-check

const { spawn } = require('child_process')

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 5000

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {string} command
 * @param {{ stdio?: 'pipe' | 'inherit', captureOutput?: boolean }} options
 * @returns {Promise<{ code: number | null, signal: string | null, output: string }>}
 */
function runCommand(
  command,
  { stdio = 'inherit', captureOutput = false } = {}
) {
  return new Promise((resolve) => {
    let output = ''
    const child = spawn('/bin/bash', ['-c', command], {
      stdio: captureOutput ? 'pipe' : stdio,
    })

    if (captureOutput) {
      child.stdout?.on('data', (data) => {
        process.stdout.write(data)
        output += data.toString()
      })
      child.stderr?.on('data', (data) => {
        process.stderr.write(data)
      })
    }

    child.on('exit', (code, signal) => {
      resolve({ code, signal, output })
    })
  })
}

/**
 * @param {string} command
 * @param {number} maxAttempts
 * @returns {Promise<boolean>}
 */
async function runWithRetry(command, maxAttempts) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Attempt ${attempt}/${maxAttempts}...`)
    const { code, signal } = await runCommand(command)

    if (!code && !signal) {
      return true // success
    }

    console.warn(
      `Attempt ${attempt} failed (exit code ${code}, signal ${signal})`
    )

    if (attempt < maxAttempts) {
      console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`)
      await sleep(RETRY_DELAY_MS)
    }
  }
  return false // all attempts failed
}

;(async function () {
  const target = process.argv[process.argv.length - 1]
  const turboCommand = `pnpm dlx turbo@${process.env.TURBO_VERSION || 'latest'}`

  // First, do a dry run to check cache status
  const { code, signal, output } = await runCommand(
    `${turboCommand} run cache-build-native --dry=json -- ${target}`,
    { captureOutput: true }
  )

  if (code || signal) {
    console.warn(
      `Dry run failed (exit code ${code}, signal ${signal}). Continuing without cache.`
    )
    return
  }

  let turboData
  try {
    turboData = JSON.parse(output)
  } catch (e) {
    console.warn(`Failed to parse turbo output: ${e.message}`)
    return
  }

  const task = turboData.tasks.find((t) => t.command !== '<NONEXISTENT>')

  if (!task) {
    console.warn(`Failed to find related turbo task`, output)
    return
  }

  // Pull cache if it was available
  if (task.cache.local || task.cache.remote) {
    console.log('Cache Status', task.taskId, task.hash, task.cache)

    const success = await runWithRetry(
      `${turboCommand} run cache-build-native -- ${target}`,
      MAX_ATTEMPTS
    )

    if (!success) {
      // Don't fail the job - the workflow will check if build exists
      // and build from source if needed
      console.warn(
        `Cache restoration failed after ${MAX_ATTEMPTS} attempts. ` +
          `Build will proceed from source.`
      )
    }
  } else {
    console.warn(`No turbo cache was available, continuing...`)
    console.warn(task)
  }
})()
