import { createElement } from 'react'
import { render } from 'react-dom'
import HeadManager from './head-manager'
import { rehydrate } from '../lib/css'
import Router from '../lib/router'
import App from '../lib/app'
import evalScript, { requireModule } from '../lib/eval-script'

const {
  __NEXT_DATA__: { component, errorComponent, props, ids, err }
} = window

document.addEventListener('DOMContentLoaded', () => {
  const Component = evalScript(component).default
  const ErrorComponent = evalScript(errorComponent).default

  const router = new Router(window.location.href, {
    Component,
    ErrorComponent,
    ctx: { err }
  })

  // This it to support error handling in the dev time with hot code reload.
  if (window.next) {
    window.next.router = router
  }

  const headManager = new HeadManager()
  const container = document.getElementById('__next')
  const appProps = { Component, props, router, headManager }

  rehydrate(ids)
  render(createElement(App, appProps), container)
})

module.exports = requireModule
