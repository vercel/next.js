import Comp from './Comp'
import Image from 'next/image'
import testPng from '../images/test.png'

export default function Page() {
  return (
    <>
      <h2>app-page</h2>
      <Image id="app-page" src={testPng} quality={90} />
      <Image
        id="remote-app-page"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="200"
        height="200"
        quality={90}
      />
      <Comp />
    </>
  )
}

export const runtime = 'edge'
