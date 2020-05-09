/* global localStorage */
/* eslint-disable camelcase */
import App from 'next/app'

export default class MyApp extends App {}

/*
  Method is experimental and will eventually be handled in a Next.js plugin
*/
export function reportWebVitals(data) {
  localStorage.setItem(
    data.name || data.entryType,
    data.value !== undefined ? data.value : data.startTime
  )
}
