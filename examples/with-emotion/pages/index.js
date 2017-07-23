import React from 'react'
import { hydrate, keyframes, css, injectGlobal } from 'emotion'
import styled from 'emotion/react'

// Adds server generated styles to emotion cache.
// '__NEXT_DATA__.ids' is set in '_document.js'
if (typeof window !== 'undefined') {
  hydrate(window.__NEXT_DATA__.ids)
}

export default () => {
  injectGlobal`
    html, body {
      padding: 3rem 1rem;
      margin: 0;
      background: papayawhip;
      min-height: 100%;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 24px;
    }
  `

  const basicStyles = css`
    background-color: white;
    color: cornflowerblue;
    border: 1px solid lightgreen;
    border-right: none;
    border-bottom: none;
    box-shadow: 5px 5px 0 0 lightgreen, 10px 10px 0 0 lightyellow;
    transition: all 0.1s linear;
    margin: 3rem 0;
    padding: 1rem 0.5rem;
  `
  const hoverStyles = css`
    &:hover {
      color: white;
      background-color: lightgray;
      border-color: aqua;
      box-shadow: -15px -15px 0 0 aqua, -30px -30px 0 0 cornflowerblue;
    }
  `
  const bounce = keyframes`
    from {
      transform: scale(1.01);
    }
    to {
      transform: scale(0.99);
    }
  `

  const Basic = styled.div`composes: ${basicStyles};`
  const Combined = styled.div`
    composes: ${basicStyles} ${hoverStyles};
    & code {
      background-color: linen;
    }
  `
  const Animated = styled.div`
    composes: ${basicStyles} ${hoverStyles};
    & code {
      background-color: linen;
    }
    animation: ${props => props.animation} 0.2s infinite ease-in-out alternate;
  `

  return (
    <div>
      <Basic>Cool Styles</Basic>
      <Combined>
        With <code>:hover</code>.
      </Combined>
      <Animated animation={bounce}>Let's bounce.</Animated>
    </div>
  )
}
