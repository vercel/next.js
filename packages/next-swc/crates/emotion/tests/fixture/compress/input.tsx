import { css } from '@emotion/react'
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

const shadowBorder = ({ width = '1px', color }) =>
  css`
    box-shadow: inset 0px 0px 0px ${width} ${color};
  `

const StyledInput = styled.input`
  ${shadowBorder({ color: 'red', width: '4px' })}
`
