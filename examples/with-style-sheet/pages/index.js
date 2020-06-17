import { useState, useEffect } from 'react'
import { StyleSheet, StyleResolver } from 'style-sheet'
const cls = StyleResolver.resolve

export default function Home() {
  const [color, setColor] = useState('#111')
  useEffect(() => {
    setTimeout(() => {
      setColor('#00f')
    }, 2000)
  })
  return (
    <div
      className={cls([styles.root, styles.another])}
      css={{
        color,
      }}
    >
      <div>
        Hello from <span className={cls(styles.brand)}>Next.js</span>
      </div>
    </div>
  )
}

const styles = StyleSheet.create({
  root: {
    fontSize: 16,
    fontFamily: 'sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundImage:
      'radial-gradient(circle, #D7D7D7, #D7D7D7 1px, #FFF 1px, #FFF)',
    backgroundSize: '1em 1em',
  },
  another: {
    fontSize: 30,
  },
  brand: {
    fontWeight: 'bold',
  },
})
