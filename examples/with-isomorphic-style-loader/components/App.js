import React from 'react'
import withStyles from 'isomorphic-style-loader/lib/withStyles'
import s from './App.css'

console.log(s)

function App () {
  return (
    <div className={s.root}>
      <h1 className={s.title}>Hello, world!</h1>
    </div>
  )
}

export default withStyles(s)(App)
