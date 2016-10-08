import { createElement } from 'react'
import { render } from 'react-dom'
import evalScript from './eval-script'
import HeadManager from './head-manager'
import Router from '../lib/router'
import DefaultApp from '../lib/app'

const {
  __NEXT_DATA__: { app, component, props }
} = window

const App = app ? evalScript(app).default : DefaultApp
const Component = evalScript(component).default

const router = new Router(location.href, { Component })
const headManager = new HeadManager()
const container = document.getElementById('__next')
const appProps = { Component, props, router, headManager }

render(createElement(App, { ...appProps }), container)
