// monkeypatch React for fixing https://github.com/facebook/react/issues/2461
// based on https://gist.github.com/Aldredcz/4d63b0a9049b00f54439f8780be7f0d8

import React from 'react'

/**
 * Traverses the prototype chain, returning the prototype object
 * on which the property is defined.
 */
const getWritableProto = (obj, p) => {
  const descr = Object.getOwnPropertyDescriptor(obj, p)
  if (descr) {
    return descr.writable ? obj : null
  }
  const proto = Object.getPrototypeOf(obj)
  return proto ? getWritableProto(proto, p) : null
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
      let { prototype } = Component
      if (prototype && prototype.render) {
        /**
         * Get the prototype object on which `render` is defined.
         */
        prototype = getWritableProto(prototype, 'render')
        if (prototype) {
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
