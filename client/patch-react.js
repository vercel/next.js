// monkeypatch React for fixing https://github.com/facebook/react/issues/2461
// based on https://gist.github.com/Aldredcz/4d63b0a9049b00f54439f8780be7f0d8

import React from 'react'

const isWritable = (obj, p) => {
  const descr = Object.getOwnPropertyDescriptor(obj, p)
  if (descr) {
    return descr.writable
  }
  const proto = Object.getPrototypeOf(obj)
  return proto ? isWritable(proto, p) : false
}

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
      if (prototype && prototype.render) {
        if (isWritable(prototype, 'render')) {
          prototype.render = wrapRender(prototype.render)
        }
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
    if (render.__wrapped) {
      return render.__wrapped
    }

    const _render = function (...args) {
      try {
        return render.apply(this, args)
      } catch (err) {
        handleError(err)
        return null
      }
    }

    // copy all properties
    Object.assign(_render, render)

    render.__wrapped = _render.__wrapped = _render

    return _render
  }
}
