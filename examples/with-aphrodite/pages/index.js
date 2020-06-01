import { StyleSheet, css } from 'aphrodite'

// Rehydrate to ensure that the client doesn't duplicate styles
// It has to execute before any code that defines styles
// '__REHYDRATE_IDS' is set in '_document.js'
if (typeof window !== 'undefined') {
  StyleSheet.rehydrate(window.__REHYDRATE_IDS)
}

export default function Home() {
  return (
    <div className={css(styles.root)}>
      <h1 className={css(styles.title)}>My page</h1>
    </div>
  )
}

const styles = StyleSheet.create({
  root: {
    width: 80,
    height: 60,
    background: 'white',
    ':hover': {
      background: 'black',
    },
  },

  title: {
    marginLeft: 5,
    color: 'black',
    fontSize: 22,
    ':hover': {
      color: 'white',
    },
  },
})
