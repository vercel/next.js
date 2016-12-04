import test from 'ava'

import React from 'react'
import { shallow } from 'enzyme'

import App from '../../lib/app'
import Router from '../../lib/router'

const Component = () => null
const ErrorComponent = () => null

const router = new Router('http://localhots/page', {
  Component,
  ErrorComponent
})

const props = { Component, router }

test('should render', t => {
  t.notThrows(() => shallow(React.createElement(App, props)))
})

test('componentDidMount should router.subscribe', t => {
  const instance = shallow(React.createElement(App, props)).instance()

  instance.componentDidMount.call({
    props: { router: { subscribe: () => t.pass() } }
  })
})

test('componentDidMount should set instance.close', t => {
  const instance = shallow(React.createElement(App, props)).instance()
  const fakeInstance = {
    props: { router: { subscribe: () => 'unittestReturn' } }
  }

  instance.componentDidMount.call(fakeInstance)
  t.true(fakeInstance.close === 'unittestReturn')
})

test('componentWillReceiveProps should call setState', t => {
  const instance = shallow(React.createElement(App, props)).instance()
  const nextState = { ...props, Component: ErrorComponent }
  instance.componentWillReceiveProps.call({ setState: () => t.pass() }, nextState)
})

test('componentWillReceiveProps should log when setState throws', t => {
  const instance = shallow(React.createElement(App, props)).instance()
  const nextState = { ...props, Component: ErrorComponent }

  console.error = (error) => { t.pass() } // eslint-disable-line

  instance.componentWillReceiveProps.call({ setState: () => { throw new Error('unittestError') } }, nextState) // eslint-disable-line
})

test('componentWillUnmount should call instance.close', t => {
  const instance = shallow(React.createElement(App, props)).instance()
  instance.componentWillUnmount.call({ close: () => t.pass() })
})
