'use client'

import { publicPath } from '../shared'

export default function Destination() {
  return <p id="destination">{publicPath()}</p>
}
