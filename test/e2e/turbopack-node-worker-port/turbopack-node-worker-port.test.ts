import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Regression coverage for Turbopack production builds failing in execution
 * environments that are not allowed to bind a local port:
 * `turbopack-node`'s process pool talks to its pooled Node.js workers over a
 * loopback TCP socket (`TcpListener::bind("127.0.0.1:0")`), so a build that has
 * to run a Node.js transform (here: PostCSS) dies with
 * `creating new process / binding to a port` and no fallback transport.
 *
 * This test asserts the *current* behavior: the pooled worker is addressed by
 * a TCP port number, and that port is really held by a loopback listener while
 * the worker starts. Once the worker IPC no longer requires a bindable
 * loopback port (e.g. a unix socket / stdio transport or a fallback), the
 * expectations below have to be updated.
 */
describe('turbopack - node worker port binding', () => {
  if (process.platform === 'win32') {
    // The `node` shim below is a POSIX shell script.
    it('should skip this suite on Windows', () => {})
    return
  }

  // The suite inspects how the local `next build` process spawns its Node.js
  // worker, which is not observable for a remote (deploy mode) build.
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // The suite's own `.test.ts` file is copied into the fixture, so skip
    // type checking it as part of the fixture's build.
    nextConfig: { typescript: { ignoreBuildErrors: true } },
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('spawns the pooled Node.js worker on a bound loopback TCP port', async () => {
    // A `node` shim earlier on `PATH` records how `turbopack-node` spawns its
    // pooled worker process (`Command::new("node")`), then execs the real node
    // so the build keeps working.
    const probeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'turbopack-node-worker-port-')
    )
    const spawnLog = path.join(probeDir, 'node-spawns.jsonl')
    const probeScript = path.join(probeDir, 'record-spawn.js')
    const nodeShim = path.join(probeDir, 'node')

    fs.writeFileSync(
      probeScript,
      `
const fs = require('fs')
const net = require('net')

const [entry = '', address = ''] = process.argv.slice(2)
const log = process.env.TURBOPACK_WORKER_SPAWN_LOG

function record(entry) {
  try {
    fs.appendFileSync(log, JSON.stringify(entry) + '\\n')
  } catch {}
}

if (!/^\\d+$/.test(address)) {
  record({ entry, address })
  process.exit(0)
}

// The spawning process is expected to already own a loopback listener on this
// port, so re-binding it has to fail with EADDRINUSE.
const server = net.createServer()
server.once('error', (err) => {
  record({ entry, address, rebind: err.code })
  process.exit(0)
})
server.listen(Number(address), '127.0.0.1', () => {
  server.close(() => {
    record({ entry, address, rebind: 'BOUND' })
    process.exit(0)
  })
})
`,
      'utf8'
    )
    fs.writeFileSync(
      nodeShim,
      `#!/usr/bin/env bash
"$TURBOPACK_WORKER_REAL_NODE" "$TURBOPACK_WORKER_PROBE_SCRIPT" "$1" "$2" || true
exec "$TURBOPACK_WORKER_REAL_NODE" "$@"
`,
      { mode: 0o755 }
    )
    fs.writeFileSync(spawnLog, '', 'utf8')

    const { exitCode, cliOutput } = await next.runCommand(
      ['build', '--turbopack'],
      {
        env: {
          PATH: `${probeDir}${path.delimiter}${process.env.PATH}`,
          TURBOPACK_WORKER_REAL_NODE: process.execPath,
          TURBOPACK_WORKER_PROBE_SCRIPT: probeScript,
          TURBOPACK_WORKER_SPAWN_LOG: spawnLog,
        },
      }
    )

    expect({ exitCode, cliOutput }).toEqual({
      exitCode: 0,
      cliOutput: expect.stringContaining('Compiled successfully'),
    })

    const spawns: Array<{ entry: string; address: string; rebind?: string }> =
      fs
        .readFileSync(spawnLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    const workerSpawns = spawns.filter(({ entry }) =>
      entry.includes('pool_entry')
    )

    expect(workerSpawns.length).toBeGreaterThan(0)

    // The only thing the worker is given to reach the build process is a TCP
    // port number, and that port is an already bound loopback listener — the
    // build therefore cannot run where binding a local port is disallowed.
    expect(
      workerSpawns.map(({ address, rebind }) => ({
        isTcpPortNumber: /^\d+$/.test(address),
        rebind,
      }))
    ).toEqual(
      workerSpawns.map(() => ({ isTcpPortNumber: true, rebind: 'EADDRINUSE' }))
    )
  })
})
