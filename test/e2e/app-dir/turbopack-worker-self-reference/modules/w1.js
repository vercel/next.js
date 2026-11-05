import { sharedValue } from '../app/shared'
import { workerOnlyValue } from './worker-only'

self.onmessage = (event) => {
  if (self.name === 'nested') {
    self.postMessage(`child:${sharedValue}:${workerOnlyValue}:${event.data}`)
    return
  }

  // Exercise the self-reference from a worker module outside the app route.
  const child = new Worker(new URL('./w1.js', import.meta.url), {
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
