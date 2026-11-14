import { sharedValue } from './shared'
import { workerOnlyValue } from '../modules/worker-only'

self.onmessage = (event) => {
  if (self.name === 'nested') {
    self.postMessage(`child:${sharedValue}:${workerOnlyValue}:${event.data}`)
    return
  }

  // Spawn the *same* file. The named child answers instead of spawning again.
  const child = new Worker(new URL('./worker.js', import.meta.url), {
    name: 'nested',
  })
  child.onmessage = (reply) => {
    self.postMessage(
      `${reply.data}|parent:${sharedValue}:${workerOnlyValue}:via-worker1`
    )
    child.terminate()
  }
  child.postMessage(event.data)
}
