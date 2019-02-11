import React from 'react'
import { StyleSheet, StyleResolver } from 'style-sheet'
const cls = StyleResolver.resolve

export default () => (
  <div className={cls([styles.root, styles.color])}>
    <div>
      Hello from <span className={cls(styles.brand)}>Next.js</span>
    </div>
  </div>
)

const styles = StyleSheet.create({
  root: {
    fontSize: 30,
    fontFamily: 'sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundImage:
      'radial-gradient(circle, #D7D7D7, #D7D7D7 1px, #FFF 1px, #FFF)',
    backgroundSize: '1em 1em'
  },
  color: {
    // showcasing dynamic styles
    color: Math.random() > 0.5 ? '#111' : '#222'
  },
  brand: {
    fontWeight: 'bold'
  }
})
