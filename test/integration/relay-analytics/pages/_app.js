/* global localStorage */
/* eslint-disable camelcase */
import App from 'next/app'

export default class MyApp extends App {}

/*
  Method is experimental and will eventually be handled in a Next.js plugin
*/

// Below comment will be used for replacing exported report method with hook based one.
///* reportWebVitals
export function reportWebVitals(data) {
  const name = data.name || data.entryType
  localStorage.setItem(
    name,
    data.value !== undefined ? data.value : data.startTime
  )
  const countMap = window.__BEACONS_COUNT
  countMap.set(name, (countMap.get(name) || 0) + 1)
}
// reportWebVitals */
