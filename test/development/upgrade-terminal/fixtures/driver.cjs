const Module = require('node:module')
const { once } = require('node:events')
const { connect } = require('node:net')
const { createInterface } = require('node:readline/promises')
const fakeWorker = process.env.UPGRADE_TEST_WORKER

// Supply a deterministic offer and replace the agent with a handoff check.
// Dev tests use the real menu in a PTY; worker tests supply actions over a pipe.
// The compiled CommonJS nudge's dynamic import also uses require.cache.
const nudge = require.resolve('next/dist/lib/upgrade/nudge')
const mock = new Module(nudge)
mock.loaded = true
mock.exports = {
  shouldPromptForUpgrade: async () => true,
  nudgeUpgrade: async (_dir, _config, _command, signal, runPrompt) =>
    runPrompt(async () => {
      if (!fakeWorker) {
        const { promptUpgrade } = require('next/dist/lib/upgrade/prompt')
        return promptUpgrade('Test upgrade available', signal)
      }
      const input = createInterface({ input: process.stdin })
      try {
        process.stdout.write('MENU_OPEN\n')
        return await input.question('', { signal })
      } catch (error) {
        if (signal.aborted) {
          return 'skip'
        }
        throw error
      } finally {
        input.close()
        process.stdout.write('MENU_CLOSED\n')
      }
    }),
  runUpgrade: async () => {
    if (!fakeWorker && process.env.UPGRADE_TEST_COMMAND !== 'build') {
      // The dev port must already be closed when the upgrade command starts.
      // A timeout or any error other than connection refused is a test failure.
      const socket = connect({
        host: '127.0.0.1',
        port: Number(process.env.UPGRADE_TEST_PORT),
      })
      socket.setTimeout(1000, () => {
        socket.destroy(new Error('Timed out checking the dev port at handoff'))
      })
      try {
        await once(socket, 'connect')
        throw new Error('Dev server is still accepting connections at handoff')
      } catch (error) {
        if (error.code !== 'ECONNREFUSED') {
          throw error
        }
      } finally {
        socket.destroy()
      }
    }
    process.stdout.write('UPGRADE_HANDOFF\n')
    return 0
  },
}
require.cache[nudge] = mock

// Lifecycle tests supply a scripted worker to provoke failures and restarts.
// Development tests leave UPGRADE_TEST_WORKER unset and use the real dev server.
if (fakeWorker) {
  const load = Module._load
  const cliModule = require.resolve(
    process.env.UPGRADE_TEST_COMMAND === 'build'
      ? 'next/dist/cli/next-build'
      : 'next/dist/cli/next-dev'
  )
  Module._load = function (id, parent, ...rest) {
    const value = load.call(this, id, parent, ...rest)
    if (parent?.filename === cliModule && id === 'node:child_process') {
      return {
        ...value,
        fork: (_file, _args, options) => value.fork(fakeWorker, [], options),
      }
    } else if (parent?.filename === cliModule && id === 'child_process') {
      return {
        ...value,
        fork: (_file, options) => value.fork(fakeWorker, options),
      }
    }
    return value
  }

  // The worker test's stderr pipe represents terminal-bound diagnostics.
  Object.defineProperty(process.stderr, 'isTTY', { value: true })
}

const cli = require.resolve('next/dist/bin/next')
process.argv = [
  process.execPath,
  cli,
  process.env.UPGRADE_TEST_COMMAND === 'build' ? 'build' : 'dev',
  ...process.argv.slice(2),
]
require(cli)
