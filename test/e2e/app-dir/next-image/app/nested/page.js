import Comp from './Comp'
import Image from 'next/image'
import testJpg from './test.jpg'

export default function NestedPage() {
  return (
    <div>
      <h2>app-nested-page</h2>
      <Image id="app-nested-page" src={testJpg} quality={75} />
      <Comp />
    </div>
  )
}
