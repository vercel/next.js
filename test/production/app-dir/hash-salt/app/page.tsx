import Image from 'next/image'
import testPng from './test.png'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <Image src={testPng} alt="test" />
    </>
  )
}
