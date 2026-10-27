import React from 'react'
import { createRoot } from 'react-dom/client'

import('nextRemote/message').then(({ message }) => {
  document.getElementById('webpack-message').textContent = message
})

const composite = document.createElement('p')
composite.id = 'manifest-composite'
document.body.appendChild(composite)
import('nextRemote/composite').then(
  ({ message }) => {
    composite.textContent = message
  },
  (error) => {
    composite.textContent = `error: ${error?.message || error}`
  }
)

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
