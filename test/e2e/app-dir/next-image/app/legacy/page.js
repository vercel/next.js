import Image from 'next/legacy/image'
import testPng from '../../images/test.png'

export default function LegacyPage() {
  return (
    <>
      <h2>app-legacy-page</h2>
      <Image id="app-legacy-page" src={testPng} loading="eager" />
    </>
  )
}
