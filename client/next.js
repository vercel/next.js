import { createElement } from 'react'
import { render } from 'react-dom'
import HeadManager from './head-manager'
import { StyleSheet } from '../lib/css'
import Router from '../lib/router'
import DefaultApp from '../lib/app'
import evalScript from '../lib/eval-script'

const {
  __NEXT_DATA__: { app, component, props, classNames }
} = window

const App = app ? evalScript(app).default : DefaultApp
const Component = evalScript(component).default

export const router = new Router(location.href, { Component })

const headManager = new HeadManager()
const container = document.getElementById('__next')
const appProps = { Component, props, router, headManager }

StyleSheet.rehydrate(classNames)
render(createElement(App, appProps), container)
