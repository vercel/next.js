import { execFile, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

const execFileAsync = promisify(execFile)

async function processTree(root: number): Promise<number[]> {
  // Read host PIDs: the sandboxed worker sees different PIDs on Linux.
  const { stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=,ppid='])
  const processes = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
  const tree = new Set([root])
  for (const pid of tree) {
    for (const [child, parent] of processes) {
      if (parent === pid) tree.add(child)
    }
  }
  return [...tree]
}

describe('image optimizer shutdown', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'kills a stuck image worker when the server receives %s',
    async (signal) => {
      const port = await findPort()
      let cli: ChildProcess | undefined
      let output = ''
      let imageProcessPid: number | undefined
      let workerPids: number[] = []
      let serverPid: number | undefined
      const capture = (text: string) => {
        output += text
        const imageProcess = output.match(/IMAGE_PROCESS_PID:(\d+)/)
        const server = output.match(/IMAGE_SERVER_PID:(\d+)/)
        if (imageProcess) imageProcessPid = Number(imageProcess[1])
        if (server) serverPid = Number(server[1])
      }
      const exited = next.runCommand(['dev', '--webpack', '-p', String(port)], {
        instance: (child) => {
          cli = child
        },
        onStdout: capture,
        onStderr: capture,
      })
      let request: Promise<unknown> | undefined
      try {
        await retry(() => expect(output).toMatch(/Ready in/))
        request = fetch(
          `http://localhost:${port}/_next/image?url=%2Fimage.svg&w=64&q=75`
        ).catch(() => {})
        await retry(() => {
          expect(output).toMatch(/IMAGE_WORKER_STUCK:(\d+)/)
          expect(output).toMatch(/IMAGE_SERVER_PID:(\d+)/)
          expect(imageProcessPid).toBeDefined()
        })
        workerPids = await processTree(imageProcessPid!)
        // Signal the CLI, which forwards the signal to the server. The hung
        // worker cannot run either signal callbacks or disconnect handlers.
        process.kill(cli!.pid!, signal)
        await retry(() => {
          for (const pid of workerPids) {
            try {
              process.kill(pid, 0)
            } catch (error) {
              // Permission denied is not evidence that the process exited.
              expect(error).toMatchObject({ code: 'ESRCH' })
              continue
            }
            throw new Error(`Image worker process ${pid} survived shutdown`)
          }
        })
        await exited
        await request
      } finally {
        // Also clean up if a readiness assertion failed before tree discovery.
        if (!workerPids.length && imageProcessPid) {
          workerPids = await processTree(imageProcessPid)
        }
        for (const pid of [...workerPids.reverse(), serverPid, cli?.pid]) {
          if (!pid) continue
          try {
            process.kill(pid, 'SIGKILL')
          } catch {}
        }
        await exited
        await request
      }
    }
  )
})
