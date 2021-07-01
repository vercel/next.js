import { useState } from 'react'
import Image from 'next/image'

const Page = () => (
  <div>
    <h1>On Loading Complete Test</h1>
    <ImageWithMessage id="1" src="/test.jpg" />
    <ImageWithMessage
      id="2"
      src={require('../public/test.png')}
      placeholder="blur"
    />
  </div>
)

function ImageWithMessage({ id, src }) {
  const [msg, setMsg] = useState('[LOADING]')
  return (
    <>
      <Image
        id={`img${id}`}
        src={src}
        width="400"
        height="400"
        onLoadingComplete={() => setMsg(`loaded img${id}`)}
      />
      <p id={`msg${id}`}>{msg}</p>
    </>
  )
}

export default Page
