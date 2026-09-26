import { ConsumerProbe } from './singleton-writer'
import { REMOTE_CONSUMER_MODULE } from './remote-view'
import { SHARED_MANIFEST_MARKER, shared } from './shared-manifest'

// The page exists to put the consumer module and the shared manifest into the
// remote's client chunks.
export default function RemotePage() {
  return (
    <>
      <pre id="remote-page">
        {JSON.stringify({
          marker: REMOTE_CONSUMER_MODULE,
          manifest: SHARED_MANIFEST_MARKER,
          keys: Object.keys(shared),
        })}
      </pre>
      <ConsumerProbe />
    </>
  )
}
