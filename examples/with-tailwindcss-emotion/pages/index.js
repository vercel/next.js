import React from 'react'
import { css } from '@emotion/core'
import styled from '@emotion/styled'
import tw from 'tailwind.macro'

/**
 * We can use macros in `styled`.
 */
const Header = styled.div`
  ${tw`font-mono text-sm text-gray-800 hover:text-red-500`}
`

const Button = styled.button`
  ${tw`bg-blue-500 text-white font-mono px-4 py-2 rounded`} :hover {
    ${tw`bg-blue-700`}
  }
`

/**
 * Also, we can use `css`.
 */
const CardStyle = css`
  ${tw`p-4 border-solid border border-gray-300  rounded p-4 shadow-xl`}
`

const Card = styled.div`
  ${CardStyle}
`

const Example = () => (
  <Card>
    <Header>Hello</Header>
    <Button>Emotion.js</Button>
  </Card>
)

export default Example
