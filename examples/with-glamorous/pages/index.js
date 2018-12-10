import React from 'react'
import { rehydrate, css } from 'glamor'
import glamorous from 'glamorous'

// Adds server generated styles to glamor cache.
// Has to run before any `style()` calls
// '__NEXT_DATA__.ids' is set in '_document.js'
if (typeof window !== 'undefined') {
  rehydrate(window.__NEXT_DATA__.ids)
}

export default () => {
  css.global('html, body', {
    padding: '3rem 1rem',
    margin: 0,
    background: 'papayawhip',
    minHeight: '100%',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '24px'
  })

  const basicStyles = {
    backgroundColor: 'white',
    color: 'cornflowerblue',
    border: '1px solid lightgreen',
    borderRight: 'none',
    borderBottom: 'none',
    boxShadow: '5px 5px 0 0 lightgreen, 10px 10px 0 0 lightyellow',
    transition: 'all 0.1s linear',
    margin: `3rem 0`,
    padding: `1rem 0.5rem`
  }

  const hoverStyles = {
    ':hover': {
      color: 'white',
      backgroundColor: 'lightgray',
      borderColor: 'aqua',
      boxShadow: `-15px -15px 0 0 aqua, -30px -30px 0 0 cornflowerblue`
    },
    '& code': {
      backgroundColor: 'linen'
    }
  }

  const crazyStyles = props => {
    const crazyStyles = hoverStyles
    const bounce = css.keyframes({
      '0%': { transform: `scale(1.01)` },
      '100%': { transform: `scale(0.99)` }
    })
    crazyStyles.animation = `${bounce} 0.2s infinite ease-in-out alternate`
    return crazyStyles
  }

  const Basic = glamorous.div(basicStyles)
  const Combined = glamorous.div(basicStyles, hoverStyles)
  const Animated = glamorous.div(basicStyles, hoverStyles, crazyStyles)

  return (
    <div>
      <Basic>Cool Styles</Basic>
      <Combined>
        With <code>:hover</code>.
      </Combined>
      <Animated>Let's bounce.</Animated>
    </div>
  )
}
