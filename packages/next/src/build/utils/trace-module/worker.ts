import { parentPort } from 'worker_threads'

// we import it to get all the relevant polyfills in place
require('next/dist/compiled/next-server/server.runtime.js')

const originalCompile = require('module').prototype._compile

let currentNode: any = null

require('module').prototype._compile = function (
  _content: string,
  filename: string
) {
  let parent = currentNode

  currentNode = {
    id: filename,
    selfDuration: 0,
    totalDuration: 0,
    children: [],
  }

  const start = performance.now()
  const result = originalCompile.apply(this, arguments)
  const end = performance.now()

  currentNode.totalDuration = end - start
  currentNode.selfDuration = currentNode.children.reduce(
    (acc: number, child: any) => acc - child.selfDuration,
    currentNode.totalDuration
  )

  parent?.children.push(currentNode)
  currentNode = parent || currentNode
  return result
}

parentPort?.on('message', (modulePath: string) => {
  for (let moduleId in require.cache) {
    delete require.cache[moduleId]
  }

  try {
    require(modulePath)
  } catch (e) {
    console.log(e)
    parentPort?.postMessage({
      error: JSON.stringify(e),
    })
  }

  parentPort?.postMessage({ modulePath, node: JSON.stringify(currentNode) })
  currentNode = null
})
