import React from 'react'
import { style, hover, merge } from 'next/css'

export default () => (
  <div className={merge(styles, hoverState)}>
    <p>Hello World</p>
  </div>
)

const styles = style({
  font: '15px Helvetica, Arial, sans-serif',
  background: '#eee',
  padding: '100px',
  textAlign: 'center',
  transition: '100ms ease-in background'
})

const hoverState = hover({
  background: '#ccc'
})
