import styled from 'styled-components'

const Test = styled.div`
  width: 100%;
`
const Test2 = styled('div')``
const Test3 = true ? styled.div`` : styled.div``
const styles = { One: styled.div`` }
let Component
Component = styled.div``
const WrappedComponent = styled(Inner)``
const StyledObjectForm = styled.div({ color: red })
const StyledFunctionForm = styled.div(p => ({ color: p.color || 'red' }))
const normalFunc = add(5, 3)
