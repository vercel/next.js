import React from 'react'
import { css, StyleSheet } from 'next/css'

export default ({ title, children }) => (
  <div className={css(styles.main)}>
    <h1 className={css(styles.title)}>{ title }</h1>
    { children }
  </div>
)

const styles = StyleSheet.create({
  main: {
    font: '15px Helvetica, Arial',
    border: '1px solid #eee',
    padding: '0 10px'
  },

  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '10px 0'
  }
})
