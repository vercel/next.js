import testJPG from '../public/test.jpg'
import Image from 'next/image'

export default function StaticImg() {
  return (
    <Image
      id="dynamic-loaded-static-jpg"
      src={testJPG}
      alt="dynamic-loaded-static-jpg"
    />
  )
}
