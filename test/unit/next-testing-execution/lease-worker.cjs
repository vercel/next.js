// Private transport proof, not a compiled Next entry or isolate:false adapter.
const { appendFileSync } = require('node:fs')
const { join } = require('node:path')
const { spawn } = require('node:child_process')
let lease
let count = 0
let first
const finalSnapshots = []
let descendant
const send = (message) =>
  new Promise((resolve, reject) =>
    process.send(message, (error) => (error ? reject(error) : resolve()))
  )
process.on('message', async (message) => {
  if (message.type === 'cancel') {
    if (lease) appendFileSync(join(lease.rootDir, 'worker-cleanup'), 'cancel\n')
    process.exit(0)
  }
  if (message.type === 'run') {
    lease = message.input
    console.log('LEASE_PID=' + process.pid)
    if (process.env.NEXT_LEASE_CONTROL === 'startup-busy') while (true) {}
    await send({ type: 'worker-ready', leaseId: lease.leaseId })
    return
  }
  const mode = process.env.NEXT_LEASE_CONTROL
  if (message.type === 'file') {
    if (mode === 'reset-module' && message.requestId)
      delete require.cache[require.resolve(join(lease.rootDir, 'shared.cjs'))]
    const shared = require(join(lease.rootDir, 'shared.cjs'))
    count++
    first ??= shared
    if (shared !== first) throw new Error('Lost actual cached helper identity')
    if (mode === 'deadline') while (true) {}
    if (mode === 'descendant') {
      descendant = spawn(process.execPath, ['-e', 'setTimeout(()=>{},4000)'], {
        stdio: ['ignore', process.stdout, process.stderr],
      })
    }
    const input = message.input
    await send({
      type: 'file-message',
      leaseId: lease.leaseId,
      requestId: message.requestId,
      message: {
        type: 'event',
        event: {
          version: 1,
          type: 'output',
          runId: lease.runId,
          timestamp: Date.now(),
          entryId: input.artifact.entryId,
          revision: input.artifact.revision,
          stream: 'stdout',
          text: JSON.stringify({
            pid: process.pid,
            count,
            token: shared.token,
            descendant: descendant?.pid,
          }),
        },
      },
    })
    const completion = {
      type: 'file-message',
      leaseId: lease.leaseId,
      requestId: message.requestId,
      reusable: mode !== 'file-poisoned',
      message: {
        type: 'complete',
        result: {
          entryId: input.artifact.entryId,
          status: 'passed',
          durationMs: 1,
        },
        ...(input.options.updateSnapshots && !mode?.startsWith('final-')
          ? { snapshotUpdates: [] }
          : {}),
      },
    }
    if (mode?.startsWith('final-') && input.options.updateSnapshots)
      finalSnapshots.push({
        requestId: message.requestId,
        updates: [
          {
            path: join(lease.rootDir, input.artifact.entryId + '.snap'),
            content: 'staged',
            previousContent: null,
          },
        ],
      })
    if (mode === 'forged') completion.message.result.entryId = 'other'
    await send(completion)
    if (mode === 'duplicate') await send(completion)
    if (mode === 'crash-after-file') process.exit(1)
    if (mode === 'late-first' && message.requestId === 1) {
      await send({
        type: 'file-message',
        leaseId: lease.leaseId,
        requestId: 0,
        message: {
          type: 'event',
          event: {
            version: 1,
            type: 'diagnostic',
            runId: lease.runId,
            timestamp: Date.now(),
            entryId: 'first',
            revision: lease.revision,
            diagnostic: { phase: 'runtime', message: 'closed first owner' },
          },
        },
      })
    }
    if (mode === 'premature-worker')
      await send({ type: 'worker-complete', leaseId: lease.leaseId })
    return
  }
  if (message.type === 'finish-worker') {
    appendFileSync(join(lease.rootDir, 'worker-cleanup'), 'finish\n')
    if (mode === 'cleanup-busy') while (true) {}
    if (mode === 'cleanup-failure') process.exit(1)
    await send({
      type: 'worker-complete',
      leaseId: lease.leaseId,
      finishToken: message.finishToken,
      ...(mode?.startsWith('final-')
        ? {
            snapshotUpdates:
              mode === 'final-forged'
                ? [{ requestId: 99, updates: [] }]
                : mode === 'final-duplicate'
                  ? [finalSnapshots[0], finalSnapshots[0]]
                  : mode === 'final-missing'
                    ? []
                    : mode === 'final-bytes'
                      ? [
                          {
                            requestId: 0,
                            updates: [
                              { path: join(lease.rootDir, 'bad.snap') },
                            ],
                          },
                        ]
                      : finalSnapshots,
          }
        : {}),
    })
    process.exit(mode === 'final-crash' ? 1 : 0)
  }
})
process.once('disconnect', () => process.exit(1))
