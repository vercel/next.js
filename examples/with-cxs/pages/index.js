import React from 'react'
import cxs from 'cxs'

export default () => (
  <div className={cx.root}>
    <h1 className={cx.title}>My page</h1>
  </div>
)

const cx = {
  root: cxs({
    width: 80,
    height: 60,
    background: 'white',
    ':hover': {
      background: 'black'
    }
  }),

  title: cxs({
    marginLeft: 5,
    color: 'black',
    fontSize: 22,
    ':hover': {
      color: 'white'
    }
  })
}
