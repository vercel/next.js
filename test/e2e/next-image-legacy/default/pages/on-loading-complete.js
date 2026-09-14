import { useState } from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  // Hoisted state to count each image load callback
  const [idToCount, setIdToCount] = useState({})
  const [clicked, setClicked] = useState(false)

  return (
    <div>
      <h1>On Loading Complete Test</h1>
      <ImageWithMessage
        id="1"
        src="/test.jpg"
        layout="intrinsic"
        width="128"
        height="128"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="2"
        src={require('../public/test.png')}
        placeholder="blur"
        layout="fixed"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="3"
        src="/test.svg"
        layout="responsive"
        width="1200"
        height="1200"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="4"
        src="/test.ico"
        layout="fill"
        objectFit="contain"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="5"
        src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAYAAACAcVaiAAAAE0lEQVR42mNk+P+/ngEKGMngAADDdwx3Uz/3AAAAAABJRU5ErkJggg=="
        layout="fixed"
        width={64}
        height={64}
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="6"
        src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAYAAACAcVaiAAAAE0lEQVR42mNk+P+/ngEKGMngAADDdwx3Uz/3AAAAAABJRU5ErkJggg=="
        layout="fill"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="7"
        src="/test.bmp"
        loading="eager"
        width="400"
        height="400"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="8"
        src={clicked ? '/foo/test-rect.jpg' : '/wide.png'}
        layout={clicked ? 'fixed' : 'intrinsic'}
        width="500"
        height="500"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <button id="toggle" onClick={() => setClicked(!clicked)}>
        Toggle
      </button>
      <div id="footer" />
    </div>
  )
}

function ImageWithMessage({ id, idToCount, setIdToCount, ...props }) {
  const [msg, setMsg] = useState('[LOADING]')
  const style =
    props.layout === 'fill'
      ? { position: 'relative', width: '64px', height: '64px' }
      : {}
  return (
    <>
      <div className="wrap" style={style}>
        <Image
          id={`img${id}`}
          onLoadingComplete={({ naturalWidth, naturalHeight }) => {
            let count = idToCount[id] || 0
            count++
            idToCount[id] = count
            setIdToCount(idToCount)
            const msg = `loaded ${count} img${id} with dimensions ${naturalWidth}x${naturalHeight}`
            setMsg(msg)
            console.log(msg)
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
