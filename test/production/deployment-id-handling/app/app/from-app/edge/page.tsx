import testImage from '../../../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello app edge</p>
      <Image src={testImage} alt="test" />
    </>
  )
}

export const runtime = 'edge'
export const preferredRegion = 'iad1'
