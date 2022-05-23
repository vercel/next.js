const styled_default = require('styled-components/native')

const TestNormal = styled.div`
  width: 100%;
`

const Test = styled_default.default.div`
  width: 100%;
`

const TestCallExpression = styled_default.default(Test)`
  height: 20px;
`
