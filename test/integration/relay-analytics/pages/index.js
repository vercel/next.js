if (typeof navigator !== 'undefined') {
  window.__BEACONS = window.__BEACONS || []
  window.__BEACONS_COUNT = new Map()

  navigator.sendBeacon = async function () {
    const args = await Promise.all(
      [...arguments].map((v) => {
        if (v instanceof Blob) {
          return v.text()
        }
        return v
      })
    )

    window.__BEACONS.push(args)
  }
}

function toggleText(e) {
  const startTime = performance.now()
  while (performance.now() < startTime + 100) {
    // busy waiting
  }
  e.target.textContent = e.target.textContent === 'Click' ? 'Press' : 'Click'
}

export default () => {
  // Below comment will be used for replacing exported report method with hook based one.
  return (
    <div>
      <h1>Foo!</h1>
      <h2>bar!</h2>
      <button onClick={toggleText}>Click</button>
    </div>
  )
}
