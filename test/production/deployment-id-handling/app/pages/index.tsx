import testImage from '../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello pages</p>
      <Image src={testImage} alt="test image" />
    </>
  )
}
