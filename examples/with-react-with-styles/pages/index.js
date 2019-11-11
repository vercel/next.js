import React from 'react'
import { css, withStyles } from '../withStyles'

function Home({ styles }) {
  return (
    <div>
      <h1 {...css(styles.title)}>My page</h1>
    </div>
  )
}

export default withStyles(({ color }) => ({
  title: {
    color: color.primary,
  },
}))(Home)
