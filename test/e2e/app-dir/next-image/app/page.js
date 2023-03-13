import Comp from './Comp'
import Image from 'next/image'
import testPng from '../images/test.png'

export default function Page() {
  return (
    <>
      <h2>app-page</h2>
      <Image id="app-page" src={testPng} quality={90} />
      <Comp />
    </>
  )
}

export const runtime = 'experimental-edge'
