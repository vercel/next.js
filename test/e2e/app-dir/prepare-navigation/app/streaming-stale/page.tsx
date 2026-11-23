import { StreamingPage } from '../../components/streaming-page'

// Keeps the prepare phase's BFCache entries fresh until the commit.
export const unstable_dynamicStaleTime = 30

export default function Page() {
  return <StreamingPage name="stale" />
}
