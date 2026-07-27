'use client'

import styled from 'styled-components'

const Button = styled.button`
  display: inline-block;
  border-radius: 3px;
  padding: 0.5rem 0;
  margin: 0.5rem 1rem;
  width: 11rem;
  color: blue;
  border: 2px solid blue;
`

const Box = styled.div`
  border: 1px solid blue;
  padding: 8px;
  margin: 8px 0;
`

const Title = styled.h3`
  color: blue;
`

export default () => {
  return (
    <Box>
      <Title>styled-components</Title>
      <Button>{`💅 This area belongs to styled-components`}</Button>
    </Box>
  )
}
