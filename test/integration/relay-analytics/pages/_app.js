/* global localStorage */
/* eslint-disable camelcase */
import App from 'next/app'

export default class MyApp extends App {}

/*
  Method is experimental and will eventually be handled in a Next.js plugin
*/
export function unstable_onPerformanceData (data) {
  localStorage.setItem(data.name, data.value || data.startTime)
}
