import { sendMessage } from '../dev/error-overlay/websocket'
import type { Span } from './tracer'

export default function reportToSocket(span: Span) {
  if (span.state.state !== 'ended') {
    throw new Error('Expected span to be ended')
  }

  sendMessage(
    JSON.stringify({
      event: 'span-end',
      startTime: span.startTime,
      endTime: span.state.endTime,
      spanName: span.name,
      attributes: span.attributes,
    })
  )
}
