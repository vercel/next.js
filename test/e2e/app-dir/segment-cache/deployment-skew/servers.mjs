import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { createServer } from 'node:http'
import httpProxy from 'http-proxy'
import process from 'node:process'

const dir = dirname(fileURLToPath(import.meta.url))

function getEnv(id, mode) {
  const base = {
    ...process.env,
    DIST_DIR: id,
    // Required so the build includes the __NEXT_HYDRATED callback used by
    // webdriver() to detect hydration. Without this, the hydration check
    // always times out and tests may interact with the page before the
    // React app router is initialized.
    __NEXT_TEST_MODE: 'e2e',
  }
  if (mode === 'BUILD_ID') {
    return {
      ...base,
      NEXT_PUBLIC_BUILD_ID: id,
    }
  } else if (mode === 'DEPLOYMENT_ID') {
    return {
      ...base,
      NEXT_DEPLOYMENT_ID: id,
    }
  } else {
    throw new Error('invalid mode ' + mode)
  }
}

async function spawnNext(id, mode, port, extraEnv = {}) {
  const child = spawn('pnpm', ['next', 'start', '-p', port, dir], {
    env: {
      ...getEnv(id, mode),
      ...extraEnv,
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

export function buildNext(id, mode) {
  spawnSync('pnpm', ['next', 'build', dir], {
    env: getEnv(id, mode),
    stdio: 'inherit',
  })
}

export function build(mode) {
  buildNext('1', mode)
  buildNext('2', mode)
}

export async function start(
  mainPort = 3000,
  nextPort1 = mainPort + 1,
  nextPort2 = mainPort + 2,
  mode = 'BUILD_ID'
) {
  const extraEnv = {
    TEST_PROXY_ORIGIN: `http://localhost:${mainPort}`,
  }

  // Start two different Next.js servers, one with BUILD_ID=1 and one
  // with BUILD_ID=2
  const [next1, next2] = await Promise.all([
    spawnNext('1', mode, nextPort1, extraEnv),
    spawnNext('2', mode, nextPort2, extraEnv),
  ])

  // Create a proxy server. If search params include `deployment=2`, proxy to
  // to the second next server. Otherwise, proxy to the first.
  const proxy = httpProxy.createProxyServer()

  // Simulate deployment skew for deployment ID-based action responses. When a
  // POST (server action) is handled by deployment 1, inject a foreign
  // x-nextjs-deployment-id header so the client detects a mismatch and
  // triggers an MPA navigation. BUILD_ID mode intentionally skips this so the
  // test exercises the response.b fallback instead.
  proxy.on('proxyRes', (proxyRes, req) => {
    if (mode === 'DEPLOYMENT_ID' && req.method === 'POST') {
      proxyRes.headers['x-nextjs-deployment-id'] = 'foreign-deployment'
    }
  })

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
