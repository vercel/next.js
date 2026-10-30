import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn } from 'child_process'
import process from 'node:process'
import { startFakeCDN } from '../../../../lib/fake-cdn.mjs'

const dir = dirname(fileURLToPath(import.meta.url))

// Redirects that happen in the proxy layer, rather than in Next.js itself. This
// is used to test that the client is still able to fully prefetch the
// target page.
export const proxyRedirects = {
  '/redirect-to-target-page': '/target-page',
}

async function spawnNext(port) {
  const child = spawn('pnpm', ['next', 'start', '-p', port, dir], {
    env: process.env,
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

export async function start(cdnPort = 3000, nextPort = cdnPort + 1) {
  const next = await spawnNext(nextPort)
  const cdn = await startFakeCDN({
    destPort: nextPort,
    port: cdnPort,
    redirects: proxyRedirects,
  })
  console.log('Server is listening', cdn.port)

  const onTerminate = () => {
    cdn.close()
    next.kill()
    process.exit(0)
  }
  process.on('SIGINT', onTerminate)
  process.on('SIGTERM', onTerminate)

  return async () => {
    next.kill()
    await cdn.close()
  }
}
