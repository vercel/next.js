import patch from './patch-react'

// apply patch first
patch((err) => {
  console.error(err)

  Promise.resolve().then(() => {
    onError(err)
  })
})

require('react-hot-loader/patch')

const next = window.next = require('./')

next.default(onError)

function onError (err) {
  // just show the debug screen but don't render ErrorComponent
  // so that the current component doesn't lose props
  next.render({ err })
}
