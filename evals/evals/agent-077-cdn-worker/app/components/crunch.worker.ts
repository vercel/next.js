import { crunchCsv } from '../../lib/crunch'

// Module worker: crunches the latency CSV off the main thread so the
// dashboard stays responsive while large reports are aggregated.
const scope = self as unknown as Worker

scope.onmessage = (event: MessageEvent<string>) => {
  scope.postMessage(crunchCsv(event.data))
}
