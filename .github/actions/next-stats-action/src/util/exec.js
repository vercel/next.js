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
    timeout: 180 * 1000,
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

module.exports = exec
