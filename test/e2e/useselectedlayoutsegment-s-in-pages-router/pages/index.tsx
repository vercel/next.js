import {
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from 'next/navigation'

export default function Page() {
  useSelectedLayoutSegment()
  useSelectedLayoutSegments()
  return 'Hello World'
}
