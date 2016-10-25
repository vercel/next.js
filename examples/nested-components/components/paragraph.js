import React from 'react'
import style from 'next/css'

export default ({ children }) => (
  <p className={styles}>{children}</p>
)

const styles = style({
  font: '13px Helvetica, Arial',
  margin: '10px 0'
})
