import Image from 'next/legacy/image'
import testJpg from '../../images/test.jpg'

export default function LegacyPage() {
  return (
    <>
      <h2>app-legacy-page</h2>
      <Image id="app-legacy-page" src={testJpg} quality={51} />
    </>
  )
}
