/* global localStorage */
import App from 'next/app'

export default class MyApp extends App {}

export function relayPerformanceData (data) {
  localStorage.setItem(data.name, data.value)
}
