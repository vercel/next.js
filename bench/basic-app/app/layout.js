import React from 'react'

import './layout.css'
import * as styles from './layout.module.css'
console.log(styles)
// require('./layout.css')
// console.log(require('./layout.module.css'))

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
