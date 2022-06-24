import Image from 'next/image'
import FutureImage from 'next/future/image'

export default function Page() {
  return (
    <>
      <h1>Example Image Usage</h1>
      <Image src="/test.jpg" width={200} height={200} />
      <hr />
      <FutureImage src="/test.png" width={200} height={200} />
    </>
  )
}
