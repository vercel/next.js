import { useState } from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <h1>Test onError</h1>
      <p>
        If error occured while loading image, native onError should be called.
      </p>
      <ImageWithMessage id="1" src="/test.png" layout="fill" />

      <ImageWithMessage id="2" src="/nonexistent-img.png" layout="fill" />
      <div id="footer" />
    </div>
  )
}

function ImageWithMessage({ id, ...props }) {
  const [msg, setMsg] = useState('no error occured')
  const style =
    props.layout === 'fill'
      ? { position: 'relative', width: '64px', height: '64px' }
      : {}

  return (
    <>
      <div className="wrap" style={style}>
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
