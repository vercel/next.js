import { Worker } from 'worker_threads'
import path from 'path'
import chalk from 'next/dist/compiled/chalk'

let worker: any

function prettyPrint(
  node: any,
  distDir: string,
  prefix = '',
  isLast = false,
  isRoot = true
) {
  let duration = `${node.selfDuration.toFixed(
    2
  )}ms / ${node.totalDuration.toFixed(2)}ms`

  let output = `${prefix}${isLast || isRoot ? '└─ ' : '├─ '}${chalk.green(
    path.relative(distDir, node.id)
  )} ${chalk.yellow(duration)}\n`

  const childPrefix = `${prefix}${isRoot ? '  ' : isLast ? '   ' : '│  '}`

  node.children.forEach((child: any, i: number) => {
    output += prettyPrint(
      child,
      node.id,
      childPrefix,
      i === node.children.length - 1,
      false
    )
  })

  return output
}

async function traceModuleImpl(modulePath: string, distDir: string) {
  return new Promise((resolve) => {
    const onResolve = ({ modulePath: mod, node }: any) => {
      if (mod !== modulePath) {
        return
      } else {
        worker.off('message', onResolve)
      }
      if (node?.error) {
        console.log('failed for module', modulePath)
        resolve(node)
      }
      require('fs').writeFileSync(
        path.join(modulePath, '..', 'trace.json'),
        node
      )

      console.log(prettyPrint(JSON.parse(node), distDir))
      resolve(node)
    }

    worker.on('message', onResolve)

    worker.postMessage(modulePath)
  })
}

const queue = [] as any[]
let pendingPromise = Promise.resolve()

function runQueue() {
  pendingPromise = pendingPromise.then(async () => {
    while (queue.length > 0) {
      const { modulePath, distDir, resolve } = queue.shift()
      const node = await traceModuleImpl(modulePath, distDir)
      resolve(node)
    }
  })
}

export function traceModule(modulePath: string, distDir: string) {
  if (!worker) {
    worker = new Worker(path.join(__dirname, 'worker.js'), {})
  }
  return new Promise((resolve) => {
    queue.push({ modulePath, distDir, resolve })
    runQueue()
  })
}
