import { useState } from 'react'
import Image from 'next/image'

const Page = () => {
  const [clicked, setClicked] = useState(false)

  return (
    <div>
      <h1>Test onError</h1>
      <p>
        If error occured while loading image, native onError should be called.
      </p>
      <button id="toggle" onClick={() => setClicked(!clicked)}>
        Toggle
      </button>

      <ImageWithMessage id="1" src="/test.png" width={200} height={200} />
      <ImageWithMessage
        id="2"
        src={clicked ? '/404.jpg' : '/test.jpg'}
        width="200"
        height="200"
      />
      <div id="footer" />
    </div>
  )
}

function ImageWithMessage({ id, ...props }) {
  const [msg, setMsg] = useState(`no error occured for img${id}`)

  return (
    <>
      <div className="wrap">
        <Image
          id={`img${id}`}
          onError={(e) => {
            setMsg(`error occured while loading ${e.target.id}`)
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
