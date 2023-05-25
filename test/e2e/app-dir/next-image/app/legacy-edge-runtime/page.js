import Image from 'next/legacy/image'
import testPng from '../../images/test.png'

export default function LegacyEdgePage() {
  return (
    <>
      <h2>app-legacy-edge-page</h2>
      <Image id="app-legacy-edge-page" src={testPng} loading="eager" />
    </>
  )
}
