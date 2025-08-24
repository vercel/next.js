import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { createServer } from 'node:http'
import httpProxy from 'http-proxy'
import process from 'node:process'

const dir = dirname(fileURLToPath(import.meta.url))

async function spawnNext(buildId, port) {
  const child = spawn('pnpm', ['next', 'start', '-p', port, dir], {
    env: {
      ...process.env,
      BUILD_ID: buildId,
      NEXT_PUBLIC_BUILD_ID: buildId,
    },
    stdio: ['inherit', 'pipe', 'inherit'],
  })

  child.stdout.pipe(process.stdout)

  // Wait until the server is listening.
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      if (data.toString().includes('Ready')) {
        resolve(child)
      }
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(child)
      } else {
        reject(new Error(`Next.js server exited with code ${code}`))
      }
    })
  })
}

export function buildNext(buildId) {
  spawnSync('pnpm', ['next', 'build', dir], {
    env: {
      ...process.env,
      BUILD_ID: buildId,
      NEXT_PUBLIC_BUILD_ID: buildId,
    },
    stdio: 'inherit',
  })
}

export function build() {
  buildNext('1')
  buildNext('2')
}

export async function start(
  mainPort = 3000,
  nextPort1 = mainPort + 1,
  nextPort2 = mainPort + 2
) {
  // Start two different Next.js servers, one with BUILD_ID=1 and one
  // with BUILD_ID=2
  const [next1, next2] = await Promise.all([
    spawnNext('1', nextPort1),
    spawnNext('2', nextPort2),
  ])

  // Create a proxy server. If search params include `deployment=2`, proxy to
  // to the second next server. Otherwise, proxy to the first.
  const proxy = httpProxy.createProxyServer()
  const server = createServer((req, res) => {
    let port = nextPort1
    if (req.url) {
      const searchParams = new URL(req.url, 'http://localhost').searchParams
      if (searchParams.get('deployment') === '2') {
        port = nextPort2
      }
    }
    proxy.web(req, res, { target: `http://localhost:${port}` })
  })

  const onTerminate = () => {
    server.close()
    next1.kill()
    next2.kill()
    process.exit(0)
  }
  process.on('SIGINT', onTerminate)
  process.on('SIGTERM', onTerminate)

  const cleanup = async () => {
    next1.kill()
    next2.kill()
    await new Promise((resolve) => server.close(resolve))
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(mainPort, () => {
      resolve(cleanup)
    })
  })
}
