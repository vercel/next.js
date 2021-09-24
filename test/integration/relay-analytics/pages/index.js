/* global localStorage */
import { useExperimentalWebVitalsReport } from 'next/vitals'

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

export default () => {
  // Below comment will be used for replacing exported report method with hook based one.
  ///* useExperimentalWebVitalsReport
  useExperimentalWebVitalsReport((data) => {
    const name = data.name || data.entryType
    localStorage.setItem(
      name,
      data.value !== undefined ? data.value : data.startTime
    )
    const countMap = window.__BEACONS_COUNT
    countMap.set(name, (countMap.get(name) || 0) + 1)
  })
  // useExperimentalWebVitalsReport */

  return (
    <div>
      <h1>Foo!</h1>
      <h2>bar!</h2>
    </div>
  )
}
