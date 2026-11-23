import { StreamingPage } from '../../components/streaming-page'

// The page blocks on its data, so it opts out of instant validation.
export const instant = false

export default function Page() {
  return <StreamingPage name="streaming" />
}
