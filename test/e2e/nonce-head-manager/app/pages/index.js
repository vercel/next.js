import React from 'react'
import Script from 'next/script'

const Page = () => {
  const [counter, setCounter] = React.useState(0)
  const [scriptURL, toggleScriptSource] = React.useReducer(
    (currentScriptURL, id) => {
      const scriptSource =
        typeof currentScriptURL === 'string'
          ? currentScriptURL
          : currentScriptURL.pathname
      if (scriptSource === '/src-1.js') {
        return new URL(`/src-2.js?key=${Math.random()}`, window.location)
      } else {
        return new URL(`/src-1.js?key=${Math.random()}`, window.location)
      }
    },
    '/src-1.js'
  )
  const scriptSource =
    typeof scriptURL === 'string' ? scriptURL : scriptURL.href

  return (
    <>
      <Script key={scriptSource} nonce="abc123" src={scriptSource} />
      <h1 id="h1">{'Count ' + counter}</h1>
      <button id="force-rerender" onClick={() => setCounter(counter + 1)}>
        Re-render
      </button>
      <button id="change-script" onClick={toggleScriptSource}>
        Change script src
      </button>
    </>
  )
}

export default Page
