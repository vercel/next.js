'use client'
import { styledCss } from 'import-map-test'

const red = styledCss`
  color: red;
`

export default function Page() {
  return (
    <>
      <h1 css={{ color: 'blue' }}>Blue</h1>
      <p css={red}>Red</p>
    </>
  )
}
