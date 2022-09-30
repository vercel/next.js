import styled from 'styled-components'

const Test = styled.div`
  width: 100%;
`
const Test2 = true ? styled.div`` : styled.div``
const styles = { One: styled.div`` }
let Component
Component = styled.div``
const WrappedComponent = styled(Inner)``
const WrappedComponent2 = styled.div({})
const WrappedComponent3 = styled(Inner)({})
const WrappedComponent4 = styled(Inner).attrs(() => ({ something: 'else' }))({})
const WrappedComponent5 = styled.div.attrs(() => ({ something: 'else' }))({})
const WrappedComponent6 = styled.div.attrs(() => ({ something: 'else' }))``
const WrappedComponent7 = styled.div.withConfig({
  shouldForwardProp: () => {},
})({})

const WrappedComponent8 = styled.div
  .withConfig({
    shouldForwardProp: () => {},
  })
  .attrs(() => ({ something: 'else' }))({})

const WrappedComponent9 = styled.div
  .attrs(() => ({ something: 'else' }))
  .withConfig({
    shouldForwardProp: () => {},
  })({})
