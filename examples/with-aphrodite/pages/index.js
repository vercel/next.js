import { StyleSheet, css } from 'aphrodite'
import { Suspense, lazy } from 'react'

// Rehydrate to ensure that the client doesn't duplicate styles
// It has to execute before any code that defines styles
// '__REHYDRATE_IDS' is set in '_document.js'
if (typeof window !== 'undefined') {
  StyleSheet.rehydrate(window.__REHYDRATE_IDS)
}

const LazyComp = lazy(() => import('./comp'));

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

export default function Home() {
  return (
    <div className={css(styles.root)}>
      <h1 className={css(styles.title)}>My page</h1>
      <Suspense placeholder={<div>'Loading'</div>}>
      <LazyComp />
      </Suspense>
    </div>
  )
}
