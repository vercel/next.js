/** @jsxImportSource @emotion/react */

import { jsx } from '@emotion/react'
import styled from '@emotion/styled'

const StyledButton = styled.button`
  background: blue;
`

function ClassNameButton({ children }) {
  return (
    <button
      className={css`
        background: blue;
      `}
    >
      {children}
    </button>
  )
}

console.log(StyledButton, ClassNameButton)
