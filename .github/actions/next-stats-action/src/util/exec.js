const logger = require('./logger')
const { promisify } = require('util')
const { exec: execOrig, spawn: spawnOrig } = require('child_process')

const execP = promisify(execOrig)
const env = {
  ...process.env,
  GITHUB_TOKEN: '',
  PR_STATS_COMMENT_TOKEN: '',
}

function exec(command, noLog = false, opts = {}) {
  if (!noLog) logger(`exec: ${command}`)
  return execP(command, {
    ...opts,
    env: { ...env, ...opts.env },
  })
}

exec.spawn = function spawn(command = '', opts = {}) {
  logger(`spawn: ${command}`)
  const child = spawnOrig('/bin/bash', ['-c', command], {
    ...opts,
    env: {
      ...env,
      ...opts.env,
    },
    stdio: opts.stdio || 'inherit',
  })

  child.on('exit', (code, signal) => {
    logger(`spawn exit (${code}, ${signal}): ${command}`)
  })
  return child
}

exec.spawnPromise = function spawnPromise(command = '', opts = {}) {
  return new Promise((resolve, reject) => {
    const child = exec.spawn(command)
    child.on('exit', (code, signal) => {
      if (code || signal) {
        return reject(
          new Error(`bad exit code/signal code: ${code} signal: ${signal}`)
        )
      }
      resolve()
    })
  })
}

module.exports = exec
