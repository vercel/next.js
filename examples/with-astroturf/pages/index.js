import React from 'react'
import styled from 'astroturf'

const Button = styled('button')`
  color: black;
  border: 1px solid black;
  background-color: white;

  &.primary {
    color: blue;
    border: 1px solid blue;
  }

  &.color-green {
    color: green;
  }
`

const IndexPage = () => (
  <Button primary color="green">
    A styled button
  </Button>
)

export default IndexPage
