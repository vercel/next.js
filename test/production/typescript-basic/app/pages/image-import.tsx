import Image from 'next/image'
import FutureImage from 'next/future/image'
import png from '../public/test.png'

export default function Page() {
  return (
    <>
      <h1>Example Image Usage</h1>
      <Image src="/test.jpg" width={200} height={200} />
      <hr />
      <FutureImage src={png} />
    </>
  )
}
