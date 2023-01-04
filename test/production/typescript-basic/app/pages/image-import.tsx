import Image from 'next/image'
import LegacyImage from 'next/legacy/image'
import png from '../public/test.png'

export default function Page() {
  return (
    <>
      <h1>Example Image Usage</h1>
      <Image src="/test.jpg" width={200} height={200} alt="" />
      <hr />
      <LegacyImage src={png} alt="" />
    </>
  )
}
