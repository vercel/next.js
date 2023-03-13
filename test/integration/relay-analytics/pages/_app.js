/* global localStorage */
/* eslint-disable camelcase */
import App from 'next/app'

export default class MyApp extends App {}

/*
  Method is experimental and will eventually be handled in a Next.js plugin
*/

export function reportWebVitals(data) {
  const name = data.name || data.entryType
  localStorage.setItem(
    name,
    data.value !== undefined ? data.value : data.startTime
  )
  const countMap = window.__BEACONS_COUNT
  countMap.set(name, (countMap.get(name) || 0) + 1)

  if (data.attribution) {
    ;(window.__metricsWithAttribution ??= []).push(data)
  }
}
