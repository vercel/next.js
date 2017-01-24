// monkeypatch React for fixing https://github.com/facebook/react/issues/2461
// based on https://gist.github.com/Aldredcz/4d63b0a9049b00f54439f8780be7f0d8

import React from 'react'

let patched = false

export default (handleError = () => {}) => {
  if (patched) {
    throw new Error('React is already monkeypatched')
  }

  patched = true

  const { createElement } = React

  React.createElement = function (Component, ...rest) {
    if (typeof Component === 'function') {
      const { prototype } = Component

      // assumes it's a class component if render method exists.
      const isClassComponent = Boolean(prototype && prototype.render) ||
        // subclass of React.Component or PureComponent with no render method.
        // There's no render method in prototype
        // when it's created with class-properties.
        prototype instanceof React.Component ||
        prototype instanceof React.PureComponent

      if (isClassComponent) {
        if (prototype.render) {
          prototype.render = wrapRender(prototype.render)
        }

        // wrap the render method in runtime when the component initialized
        // for class-properties.
        Component = wrap(Component, withWrapOwnRender)
      } else {
        // stateless component
        Component = wrapRender(Component)
      }
    }

    return createElement.call(this, Component, ...rest)
  }

  const { Component: { prototype: componentPrototype } } = React
  const { forceUpdate } = componentPrototype

  componentPrototype.forceUpdate = function (...args) {
    if (this.render) {
      this.render = wrapRender(this.render)
    }
    return forceUpdate.apply(this, args)
  }

  function wrapRender (render) {
    return wrap(render, withHandleError)
  }

  function withHandleError (fn, ...args) {
    try {
      return fn.apply(this, args)
    } catch (err) {
      handleError(err)
      return null
    }
  }

  function withWrapOwnRender (fn, ...args) {
    const result = fn.apply(this, args)
    if (this.render && this.hasOwnProperty('render')) {
      this.render = wrapRender(this.render)
    }
    return result
  }
}

function wrap (fn, around) {
  if (fn.__wrapped) {
    return fn.__wrapped
  }

  const _fn = function (...args) {
    return around.call(this, fn, ...args)
  }

  // copy all properties
  Object.assign(_fn, fn)

  _fn.prototype = fn.prototype

  _fn.__wrapped = fn.__wrapped = _fn

  return _fn
}
