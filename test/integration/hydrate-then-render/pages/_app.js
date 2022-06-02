/* eslint-disable camelcase */
import App from 'next/app'

if (typeof navigator !== 'undefined') {
  window.__BEACONS = window.__BEACONS || []

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

export default class MyApp extends App {}

export function reportWebVitals(data) {
  navigator.sendBeacon('/test', new URLSearchParams(data).toString())
}
