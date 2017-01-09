import patch from './patch-react'

// apply patch first
patch((err) => {
  console.error(err)
  next.renderError(err)
})

require('react-hot-loader/patch')

const next = require('./next')
window.next = next
