/* global localStorage */
import App from 'next/app'

export default class MyApp extends App {}

export function onPerformanceData (data) {
  localStorage.setItem(data.name, data.value || data.startTime)
}
