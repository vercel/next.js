import React from 'react'
import { style } from 'glamor'

export default () => <h1 {...styles.title}>My page</h1>

const styles = {
  title: style({
    color: 'red',
    fontSize: 50
  })
}
