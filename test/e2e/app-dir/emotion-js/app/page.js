'use client'
import { styledJsx } from 'import-map-test'

const red = styledJsx.p({ color: 'red' })

export default function Page() {
  return (
    <>
      <h1 css={{ color: 'blue' }}>Blue</h1>
      <p className={red}>Red</p>
    </>
  )
}
