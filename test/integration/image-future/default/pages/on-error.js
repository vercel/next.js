import { useState } from 'react'
import Image from 'next/future/image'

const Page = () => {
  return (
    <div>
      <h1>Test onError</h1>
      <p>
        If error occured while loading image, native onError should be called.
      </p>
      <ImageWithMessage id="1" src="/test.png" width={200} height={200} />

      <ImageWithMessage
        id="2"
        src="/nonexistent-img.png"
        width={200}
        height={200}
      />
      <div id="footer" />
    </div>
  )
}

function ImageWithMessage({ id, ...props }) {
  const [msg, setMsg] = useState('no error occured')

  return (
    <>
      <div className="wrap">
        <Image
          id={`img${id}`}
          onError={(e) => {
            const msg = `error occured while loading ${e.target.id}`
            setMsg(msg)
          }}
          {...props}
        />
      </div>
      <p id={`msg${id}`}>{msg}</p>
      <hr />
    </>
  )
}

export default Page
