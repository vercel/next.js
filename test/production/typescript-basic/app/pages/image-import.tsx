import Image from 'next/image'
import FutureImage from 'next/future/image'

import jpg from '../public/test.jpg'
import png from '../public/test.png'

export default function Page() {
  return (
    <>
      <h1>Example Image Usage</h1>
      <Image src={jpg} />
      <hr />
      <FutureImage src={png} />
    </>
  )
}
