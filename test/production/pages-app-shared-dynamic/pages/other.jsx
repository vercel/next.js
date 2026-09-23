import Shared from '../components/Shared'

// A second pages route importing Shared keeps webpack from concatenating the
// pages-layer copy into pages/index, which is what lets the App Router copy be
// walked last and win the manifest slot.
export default function Other() {
  return <Shared router="pages (other)" />
}
