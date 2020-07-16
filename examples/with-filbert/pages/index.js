import { Global, styled } from '@filbert-js/core'

import React from 'react'

const Text = styled('div')`
  color: hotpink;
`
const Heading = styled('h1')`
  outline: none;
  text-decoration: none;
  font-weight: 300;
  letter-spacing: 1px;
  transition: all 0.2s ease;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.01);
  padding: 0.4125em 1.25em;
  color: #3793e0;

  &:hover {
    border-bottom-color: #4682b4;
    border-bottom: 1px solid;
  }
  a {
    color: #3793e0;
    text-decoration: none;
  }
`
const Small = styled('div')`
  color: black;
`
const Container = styled('div')`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  > * + * {
    margin-top: 1rem;
  }
`
export default function Home() {
  return (
    <Container>
      <Global
        styles={`
          html,
          body {
            padding: 0;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
              Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
              sans-serif;
          }
  
          * {
            box-sizing: border-box;
          }
          
        `}
      />
      <img src="/filbert.png" width="150" alt="filbert" />
      <Heading>
        <a target="_black" href="https://filbert-js.vercel.app/">
          {' '}
          Welcome to Filbert!
        </a>
      </Heading>
      <Small>A light weight(~1KB) css-in-js solution(framework)🎨</Small>
      <Text>Next JS is awesome</Text>
    </Container>
  )
}
