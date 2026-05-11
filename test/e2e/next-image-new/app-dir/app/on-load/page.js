'use client'
import { useState } from 'react'
import Image from 'next/image'

const Page = () => {
  const [idToCount, setIdToCount] = useState({})
  const [clicked, setClicked] = useState(false)

  const red =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8ysv7HwAEngHwC+JqOgAAAABJRU5ErkJggg=='

  return (
    <div>
      <h1>Test onLoad</h1>
      <p>This is the native onLoad</p>
      <button id="toggle" onClick={() => setClicked(!clicked)}>
        Toggle
      </button>

      <ImageWithMessage
        id="1"
        src={clicked ? '/test.jpg' : red}
        width="128"
        height="128"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="2"
        src={clicked ? require('../../public/test.png') : red}
        placeholder={clicked ? 'blur' : 'empty'}
        width="256"
        height="256"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="3"
        src={clicked ? '/test.svg' : red}
        width="1200"
        height="1200"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="4"
        src={clicked ? '/test.ico' : red}
        width={200}
        height={200}
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="5"
        src="/wide.png"
        width="600"
        height="300"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

      <ImageWithMessage
        id="6"
        src={red}
        width="300"
        height="300"
        idToCount={idToCount}
        setIdToCount={setIdToCount}
      />

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
          alt={`img${id}`}
          onLoad={(e) => {
            let count = idToCount[id] || 0
            count++
            idToCount[id] = count
            setIdToCount(idToCount)
            setMsg(`loaded ${e.target.id} with native onLoad, count ${count}`)
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
