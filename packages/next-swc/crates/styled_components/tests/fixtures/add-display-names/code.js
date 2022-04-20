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
class ClassComponent {
  static Child = styled.div``
}
var GoodName = BadName = styled.div``;
