import * as React from 'react'

const Home = () => {
  if (typeof window !== 'undefined') {
    window.didRender = true
  }

  React.useEffect(() => {
    // If this script is loaded before the polyfills it will
    // still fail
    const el = document.createElement('script')
    el.src = '/regexp-test.js'
    document.querySelector('body').appendChild(el)
  }, [])

  return (
    <>
      <p>hi</p>
    </>
  )
}

export default Home
