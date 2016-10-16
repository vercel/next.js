import React from 'react'
import { css, StyleSheet } from 'next/css'

export default () => (
  <div className={css(styles.main)}>
    <p>Hello World</p>
  </div>
)

const styles = StyleSheet.create({
  main: {
    font: '15px Helvetica, Arial, sans-serif',
    background: '#eee',
    padding: '100px',
    textAlign: 'center',
    transition: '100ms ease-in background',
    ':hover': {
      background: '#ccc'
    }
  }
})
