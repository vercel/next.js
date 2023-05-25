import Image from 'next/legacy/image'
import testJpg from '../../images/test.jpg'

export default function LegacyEdgePage() {
  return (
    <>
      <h2>app-legacy-edge-page</h2>
      <Image id="app-legacy-edge-page" src={testJpg} quality={54} />
    </>
  )
}
