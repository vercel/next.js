import { useState } from 'react'
import Image from 'next/image'

const Page = () => (
  <div>
    <h1>On Loading Complete Test</h1>
    <ImageWithMessage
      id="1"
      src="/test.jpg"
      layout="intrinsic"
      width="128"
      height="128"
    />
    <ImageWithMessage
      id="2"
      src={require('../public/test.png')}
      placeholder="blur"
      layout="fixed"
    />
    <ImageWithMessage
      id="3"
      src="/test.svg"
      layout="responsive"
      width="1200"
      height="1200"
    />
    <div style={{ position: 'relative', width: '64px', height: '64px' }}>
      <ImageWithMessage
        id="4"
        src="/test.ico"
        layout="fill"
        objectFit="contain"
      />
    </div>
    <div id="footer" />
  </div>
)

function ImageWithMessage({ id, ...props }) {
  const [msg, setMsg] = useState('[LOADING]')
  return (
    <>
      <Image
        id={`img${id}`}
        onLoadingComplete={({ naturalWidth, naturalHeight }) =>
          setMsg(
            `loaded img${id} with dimensions ${naturalWidth}x${naturalHeight}`
          )
        }
        {...props}
      />
      <p id={`msg${id}`}>{msg}</p>
      <hr />
    </>
  )
}

export default Page
