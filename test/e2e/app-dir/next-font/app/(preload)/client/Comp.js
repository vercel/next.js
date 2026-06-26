'use client'
import { font6 } from '../../../fonts'

export default function Component() {
  return (
    <p id="client-comp" className={font6.className}>
      {JSON.stringify(font6)}
    </p>
  )
}
