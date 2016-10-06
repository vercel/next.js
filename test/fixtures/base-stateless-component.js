
import React from 'react'
import { StyleSheet, css } from '../../lib/css'

export default () => <h1 className={css(styles.h1)}>My component!</h1>

const styles = StyleSheet.create({
  h1: { color: 'red' }
})
