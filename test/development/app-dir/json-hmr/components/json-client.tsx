'use client'

import config from '../data/config.json'

export default function JsonClient() {
  return <p id="client-value">{config.value}</p>
}
