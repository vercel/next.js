import { StreamingPage } from '../../components/streaming-page'

// Same as /streaming-target. The test drops the connection of its response
// after the shell.
export const instant = false

export default function Page() {
  return <StreamingPage name="error" />
}
