import testImage from '../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello pages edge</p>
      <Image src={testImage} alt="test image" />
    </>
  )
}

export const config = {
  runtime: 'experimental-edge',
}
