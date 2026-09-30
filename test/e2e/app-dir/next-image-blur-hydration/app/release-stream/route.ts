import { streamControl } from '../../components/stream-control'

export function POST() {
  if (!streamControl.releaseImageStream)
    return new Response(null, { status: 409 })
  streamControl.releaseImageStream()
  delete streamControl.releaseImageStream
  return new Response(null, { status: 204 })
}
