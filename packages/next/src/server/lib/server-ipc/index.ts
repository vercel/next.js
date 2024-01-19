import type NextServer from '../../next-server'
import { errorToJSON } from '../../render'
import crypto from 'crypto'
import isError from '../../../lib/is-error'
import { deserializeErr } from './request-utils'

// we can't use process.send as jest-worker relies on
// it already and can cause unexpected message errors
// so we create an IPC server for communicating
export async function createIpcServer(
  server: InstanceType<typeof NextServer>
): Promise<{
  ipcPort: number
  ipcServer: import('http').Server
  ipcValidationKey: string
}> {
  // Generate a random key in memory to validate messages from other processes.
  // This is just a simple guard against other processes attempting to send
  // traffic to the IPC server.
  const ipcValidationKey = crypto.randomBytes(32).toString('hex')

  const ipcServer = (require('http') as typeof import('http')).createServer(
    async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://n')
        const key = url.searchParams.get('key')

        if (key !== ipcValidationKey) {
          return res.end()
        }

        const method = url.searchParams.get('method')
        const args: any[] = JSON.parse(url.searchParams.get('args') || '[]')

        if (!method || !Array.isArray(args)) {
          return res.end()
        }

        if (typeof (server as any)[method] === 'function') {
          if (method === 'logErrorWithOriginalStack' && args[0]?.stack) {
            args[0] = deserializeErr(args[0])
          }
          let result = await (server as any)[method](...args)

          if (result && typeof result === 'object' && result.stack) {
            result = errorToJSON(result)
          }
          res.end(JSON.stringify(result || ''))
        }
      } catch (err: any) {
        if (isError(err) && err.code !== 'ENOENT') {
          console.error(err)
        }
        res.end(
          JSON.stringify({
            err: { name: err.name, message: err.message, stack: err.stack },
          })
        )
      }
    }
  )

  const ipcPort = await new Promise<number>((resolveIpc) => {
    ipcServer.listen(0, server.hostname, () => {
      const addr = ipcServer.address()

      if (addr && typeof addr === 'object') {
        resolveIpc(addr.port)
      }
    })
  })

  return {
    ipcPort,
    ipcServer,
    ipcValidationKey,
  }
}
