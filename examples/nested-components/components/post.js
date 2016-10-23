import React from 'react'
import { style } from 'next/css'

export default ({ title, children }) => (
  <div className={mainStyle}>
    <h1 className={titleStyle}>{ title }</h1>
    { children }
  </div>
)

const mainStyle = style({
  font: '15px Helvetica, Arial',
  border: '1px solid #eee',
  padding: '0 10px'
})

const titleStyle = style({
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '10px 0'
})
