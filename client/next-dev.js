import 'react-hot-loader/patch'
import patch from './patch-react'

// apply patch first
patch((err) => {
  console.error(err)
  next.renderError(err)
})

const next = require('./next')
window.next = next
