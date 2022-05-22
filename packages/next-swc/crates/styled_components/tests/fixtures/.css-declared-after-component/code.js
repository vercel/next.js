import React from "react"
import { css } from "styled-components"

export default function Example() {
  return <div css={someCss}>oops</div>
}

const someCss = css`
  color: red;
`
