import { createGlobalStyle, css, keyframes } from 'styled-components'

const key = keyframes`
  to {
    transform: rotate(360deg);
  }
`

const color = css`
  color: ${theColor};
`

const GlobalStyles = createGlobalStyle`
  html {
    color: red;
  }
`
