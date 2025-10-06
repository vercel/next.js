import { StreamingText } from '../../streaming-text'

export default function Page() {
  return (
    <div id="nav">
      <StreamingText static="Static in nav" dynamic="Dynamic in nav" />
    </div>
  )
}
