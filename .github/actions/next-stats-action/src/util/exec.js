const logger = require('./logger')
const { promisify } = require('util')
const { execFile, spawn: spawnOrig } = require('child_process')

const execP = promisify(execFile)
const env = {
  ...process.env,
  GITHUB_TOKEN: '',
  PR_STATS_COMMENT_TOKEN: '',
}

function exec(command, arg2, arg3, arg4) {
  // Support both exec(command, noLog?, opts?) and exec(command, args, noLog?, opts?)
  let args = []
  let noLog = false
  let opts = {}

  if (Array.isArray(arg2)) {
    args = arg2
    if (typeof arg3 === 'boolean') {
      noLog = arg3
      if (arg4 && typeof arg4 === 'object') {
        opts = arg4
      }
    } else if (arg3 && typeof arg3 === 'object') {
      opts = arg3
    }
  } else {
    // Backwards-compatible path: arg2 is noLog, arg3 is opts
    if (typeof arg2 === 'boolean') {
      noLog = arg2
    }
    if (arg3 && typeof arg3 === 'object') {
      opts = arg3
    }
  }

  if (!noLog) logger(`exec: ${command} ${args.join(' ')}`.trim())
  return execP(command, args, {
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
    const child = exec.spawn(command, opts)
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
