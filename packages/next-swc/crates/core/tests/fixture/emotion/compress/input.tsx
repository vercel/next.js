import styled from '@emotion/styled'

const unitNormal = '1rem'
const unitLarge = '2rem'

const Example = styled.div`
  margin: ${unitNormal} ${unitLarge};
`

export const Animated = styled.div`
  & code {
    background-color: linen;
  }
  animation: ${({ animation }) => animation} 0.2s infinite ease-in-out alternate;
`
