import React from 'react'
import { StyleSheet, css } from 'aphrodite'

if (typeof window !== 'undefined') {
  /* StyleSheet.rehydrate takes an array of rendered classnames,
  and ensures that the client side render doesn't generate
  duplicate style definitions in the <style data-aphrodite> tag */
  StyleSheet.rehydrate(window.__NEXT_DATA__.ids)
}

export default () => (
  <div className={css(styles.root)}>
    <h1 className={css(styles.title)}>My page</h1>
  </div>
)

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
