import { createElement } from 'react'
import { render } from 'react-dom'
import evalScript from './eval-script'
import Router from './router'
import DefaultApp from '../lib/app'

const {
  __NEXT_DATA__: { app, component, props }
} = window

const App = app ? evalScript(app).default : DefaultApp
const Component = evalScript(component).default

const router = new Router({ Component, props })
const container = document.getElementById('__next')
const appProps = { Component, props, router }

render(createElement(App, { ...appProps }), container)
