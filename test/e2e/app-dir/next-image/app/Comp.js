import Image from 'next/image'
import testPng from '../images/test.png'

export default function Comp() {
  return (
    <div>
      <h2>app-comp</h2>
      <Image id="app-comp" src={testPng} quality={80} />
    </div>
  )
}
