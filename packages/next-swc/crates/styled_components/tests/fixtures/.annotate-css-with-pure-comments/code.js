import styled, { css } from 'styled-components'

const partial = css`
  color: red;
`

const Component = styled.div`
  ${partial};
  background: blue;
`
