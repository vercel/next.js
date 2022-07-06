import { useState } from 'react'
import Image from 'next/future/image'

const Page = () => {
  const [clicked, setClicked] = useState(false)

  const red =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8ysv7HwAEngHwC+JqOgAAAABJRU5ErkJggg=='

  return (
    <div>
      <h1>Test onLoad</h1>
      <p>
        This is the native onLoad which doesn't work as many places as
        onLoadingComplete
      </p>
      <button id="toggle" onClick={() => setClicked(!clicked)}>
        Toggle
      </button>

      <ImageWithMessage
        id="1"
        src={clicked ? '/test.jpg' : red}
        width="128"
        height="128"
      />

      <ImageWithMessage
        id="2"
        src={clicked ? require('../public/test.png') : red}
        placeholder={clicked ? 'blur' : 'empty'}
        width="256"
        height="256"
      />

      <ImageWithMessage
        id="3"
        src={clicked ? '/test.svg' : red}
        width="1200"
        height="1200"
      />

      <ImageWithMessage
        id="4"
        src={clicked ? '/test.ico' : red}
        width={200}
        height={200}
      />

      <ImageWithMessage
        id="5"
        src={clicked ? '/wide.png' : red}
        width="500"
        height="500"
      />

      <div id="footer" />
    </div>
  )
}

function ImageWithMessage({ id, ...props }) {
  const [msg, setMsg] = useState('[LOADING]')
  return (
    <>
      <div className="wrap">
        <Image
          id={`img${id}`}
          onLoad={(e) => {
            setMsg(`loaded ${e.target.id} with native onLoad`)
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
