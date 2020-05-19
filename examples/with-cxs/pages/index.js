import React from 'react'
import cxs from 'cxs/lite'

// Using cxs/lite on both the server and client,
// the styles will need to be rehydrated.
if (typeof window !== 'undefined') {
  const styleTag = document.getElementById('cxs-style')
  const serverCss = styleTag.innerHTML
  cxs.rehydrate(serverCss)
}

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
      background: 'black',
    },
  }),

  title: cxs({
    marginLeft: 5,
    color: 'black',
    fontSize: 22,
    ':hover': {
      color: 'white',
    },
  }),
}
