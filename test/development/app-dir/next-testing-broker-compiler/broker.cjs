const { join } = require('path')
const { access } = require('fs/promises')
const { fork } = require('child_process')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const {
  createExecutionBrokerHost,
} = require('next/dist/experimental/testing/execution/broker')

async function main() {
  const mode = process.argv[2]
  const projectDir = process.cwd()
  const profile = {
    id: 'broker',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'broker:' + mode,
    file: join(
      projectDir,
      'specs',
      mode === 'env' ? 'broker-env.mjs' : 'broker-busy.mjs'
    ),
    profile,
  }
  const setupFiles = []
  const compiler = await createTestCompilerSession(projectDir, profile)
  let host
  let client
  let workerPid
  let clientClosed
  let closedError
  try {
    const artifact = await compiler.compile(entry, {
      signal: new AbortController().signal,
      setupFiles,
    })
    await compiler.shutdownCompilation()
    process.env.NEXT_TEST_BROKER_ENV_PROBE = 'stale-parent'
    client = fork(join(projectDir, 'broker-client.cjs'), [], {
      cwd: projectDir,
      env: { ...process.env, NEXT_TEST_BROKER_ENV_PROBE: 'resolved-child' },
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    client.stdout.on('data', (data) => process.stdout.write(data))
    client.stderr.on('data', (data) => process.stderr.write(data))
    clientClosed = new Promise((resolve) =>
      client.once('close', (code, signal) => resolve({ code, signal }))
    )
    const controller = new AbortController()
    const events = []
    let result
    let resolveReady
    let rejectReady
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    void clientClosed.then(() => {
      if (!workerPid)
        rejectReady(
          new Error('Broker client closed before the compiled worker started')
        )
    })
    host = createExecutionBrokerHost({
      signal: controller.signal,
      async send(message) {
        if (message.action === 'event') {
          events.push(message.event)
          if (message.event.type === 'output') {
            const match = message.event.text.match(/BROKER_FILE_PID=(\d+)/)
            if (match) {
              workerPid = Number(match[1])
              resolveReady()
              if (mode === 'send-failure')
                throw new Error('EXPECTED_BROKER_SEND_FAILURE')
            }
          }
        }
        await new Promise((resolve, reject) => {
          if (!client.connected)
            return reject(new Error('Broker client disconnected'))
          client.send(message, (error) => (error ? reject(error) : resolve()))
        })
      },
    })
    client.on('message', (message) => {
      if (host.handle(message)) return
      if (message.type !== 'client-result')
        throw new Error('Unexpected broker response')
      result = message.result
    })
    client.send({
      type: 'start',
      artifact,
      options: {
        runId: 'broker-run',
        projectDir,
        entry,
        setupFiles,
        testTimeout: 30000,
        hookTimeout: 10000,
        fileTimeout: 30000,
      },
    })
    await ready
    const beganClose = performance.now()
    if (mode === 'crash') {
      client.kill('SIGKILL')
      await clientClosed
    } else if (mode === 'cancel') {
      controller.abort(new Error('Broker integration cancelled'))
      await clientClosed
    } else if (mode === 'env') {
      await clientClosed
    }
    try {
      await host.close()
    } catch (error) {
      closedError = error.message
    }
    if (mode === 'send-failure') {
      client.kill('SIGKILL')
      await clientClosed
    }
    let workerGone = false
    try {
      process.kill(workerPid, 0)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
      workerGone = true
    }
    await access(join(artifact.rootDir, artifact.entryPath))
    return {
      events,
      result,
      closedError,
      workerGone,
      workerPid,
      clientPid: client.pid,
      clientExit: await clientClosed,
      closeDuration: performance.now() - beganClose,
      artifactRetained: true,
      ownershipClosed: host.ownershipClosed,
      parentEnvironment: process.env.NEXT_TEST_BROKER_ENV_PROBE,
    }
  } finally {
    try {
      await host?.close()
    } catch {}
    if (client && client.exitCode === null && client.signalCode === null)
      client.kill('SIGKILL')
    await clientClosed
    if (!host || host.ownershipClosed) await compiler.dispose()
    else throw new Error('Broker ownership is unconfirmed; artifact retained')
  }
}
main()
  .then((result) => console.log('BROKER_RESULT=' + JSON.stringify(result)))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
