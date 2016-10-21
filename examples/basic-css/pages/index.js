import React from 'react'
import { style } from 'next/css'

export default () => (
  <div className={styles}>
    <p>Hello World</p>
  </div>
)

const styles = style({
  font: '15px Helvetica, Arial, sans-serif',
  background: '#eee',
  padding: '100px',
  textAlign: 'center',
  transition: '100ms ease-in background',
  ':hover': {
    background: '#ccc'
  }
})
