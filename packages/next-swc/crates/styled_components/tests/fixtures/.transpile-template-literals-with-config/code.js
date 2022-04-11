import styled, { css, createGlobalStyle } from 'styled-components'

const Named = styled.div`
  width: 100%;
`

const NamedWithInterpolation = styled.div`
  color: ${color => props.color};
`

const Wrapped = styled(Inner)`
  color: red;
`

const Foo = styled.div({
  color: 'green',
})

const style = css`
  background: green;
`

const GlobalStyle = createGlobalStyle`
  html {
    background: silver;
  }
`
