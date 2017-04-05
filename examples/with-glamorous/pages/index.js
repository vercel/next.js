import React from 'react'
import { css } from 'glamor'
import glamorous from 'glamorous'

export default () => {
  css.global('html, body', { padding: '3rem 1rem', margin: 0, background: 'papayawhip', 'min-height': '100%', 'font-family': 'Helvetica, Arial, sans-serif', 'font-size': '24px' })

  const basicStyles = {
    'background-color': 'white',
    color: 'cornflowerblue',
    border: '1px solid lightgreen',
    'border-right': 'none',
    'border-bottom': 'none',
    'box-shadow': '5px 5px 0 0 lightgreen, 10px 10px 0 0 lightyellow',
    transition: 'all 0.1s linear',
    margin: `3rem 0`,
    padding: `1rem 0.5rem`
  }

  const hoverStyles = {
    ':hover': {
      color: 'white',
      'background-color': 'lightgray',
      'border-color': 'aqua',
      'box-shadow': `-15px -15px 0 0 aqua, -30px -30px 0 0 cornflowerblue`
    },
    '& code': {
      'background-color': 'linen'
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
      <Basic>
        Cool Styles
      </Basic>
      <Combined>
        With <code>:hover</code>.
      </Combined>
      <Animated>
        Let's bounce.
      </Animated>
    </div>
  )
}
