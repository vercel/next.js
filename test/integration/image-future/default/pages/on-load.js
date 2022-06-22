import { useState } from 'react'
import Image from 'next/future/image'

const Page = () => {
  // Hoisted state to count each image load callback
  const [idToCount, setIdToCount] = useState({})
  const [clicked, setClicked] = useState(false)

  return (
    <div>
      <h1>Test onLoad</h1>
      <p>
        This is the native onLoad which doesn't work as many places as
        onLoadingComplete
      </p>
      <ImageWithMessage
        id="1"
        src="/test.jpg"
        width="128"
        height="128"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="2"
        src={require('../public/test.png')}
        placeholder="blur"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="3"
        src="/test.svg"
        width="1200"
        height="1200"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="4"
        src="/test.ico"
        width={200}
        height={200}
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="8"
        src={clicked ? '/foo/test-rect.jpg' : '/wide.png'}
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
  return (
    <>
      <div className="wrap">
        <Image
          id={`img${id}`}
          onLoad={(e) => {
            let count = idToCount[id] || 0
            count++
            idToCount[id] = count
            setIdToCount(idToCount)
            const msg = `loaded ${count} ${e.target.id} with native onLoad`
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
