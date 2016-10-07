
import React from 'react'
import { StyleSheet, css } from '../../lib/css'

export default () => <div className={css(styles.red)}>This is red</div>

const styles = StyleSheet.create({
  red: { color: 'red' }
})
