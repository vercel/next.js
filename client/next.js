import { createElement } from 'react'
import { render } from 'react-dom'
import HeadManager from './head-manager'
import { rehydrate } from '../lib/css'
import Router from '../lib/router'
import App from '../lib/app'
import evalScript from '../lib/eval-script'

const {
  __NEXT_DATA__: { component, props, ids, err }
} = window

const Component = evalScript(component).default

export const router = new Router(window.location.href, { Component, ctx: { err } })

const headManager = new HeadManager()
const container = document.getElementById('__next')
const appProps = { Component, props, router, headManager }

rehydrate(ids)
render(createElement(App, appProps), container)
