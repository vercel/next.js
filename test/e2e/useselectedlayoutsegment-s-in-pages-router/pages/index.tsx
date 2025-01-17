import {
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from 'next/navigation'

export default function Page() {
  useSelectedLayoutSegment()
  useSelectedLayoutSegments()
  return <p id="hello-world">Hello World</p>
}
