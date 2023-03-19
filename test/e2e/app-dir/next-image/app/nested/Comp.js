import Image from 'next/image'
import testJpg from './test.jpg'

export default function Comp() {
  return (
    <div>
      <h2>app-nested-comp</h2>
      <Image id="app-nested-comp" src={testJpg} quality={65} />
    </div>
  )
}
