import React from 'react'
import { css, StyleSheet } from 'next/css'

export default ({ children }) => (
  <p className={css(styles.main)}>{children}</p>
)

const styles = StyleSheet.create({
  main: {
    font: '13px Helvetica, Arial',
    margin: '10px 0'
  }
})
