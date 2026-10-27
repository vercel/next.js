import React from 'react'
import { createRoot } from 'react-dom/client'

import('nextRemote/message').then(({ message }) => {
  document.getElementById('webpack-message').textContent = message
})

const mount = document.createElement('div')
document.body.appendChild(mount)
import('nextRemote/component').then(
  ({ default: Component }) => {
    createRoot(mount).render(React.createElement(Component))
  },
  (error) => {
    mount.textContent = `error: ${error?.message || error}`
  }
)
