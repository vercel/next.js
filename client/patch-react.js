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
      // We need to get the prototype which has the render method.
      // It's possible to have render inside a deeper prototype due to
      // class extending.
      const prototypeWithRender = getRenderPrototype(Component)
      const { prototype } = Component

      // assumes it's a class component if render method exists.
      const isClassComponent = Boolean(prototypeWithRender) ||
        // subclass of React.Component or PureComponent with no render method.
        // There's no render method in prototype
        // when it's created with class-properties.
        prototype instanceof React.Component ||
        prototype instanceof React.PureComponent

      let dynamicWrapper = withWrapOwnRender

      if (isClassComponent) {
        if (prototypeWithRender) {
          // Sometimes render method is created with only a getter.
          // In that case we can't override it with a prototype. We need to
          // do it dynamically.
          if (canOverrideRender(prototypeWithRender)) {
            prototypeWithRender.render = wrapRender(prototypeWithRender.render)
          } else {
            dynamicWrapper = withWrapRenderAlways
          }
        }

        // wrap the render method in runtime when the component initialized
        // for class-properties.
        Component = wrap(Component, dynamicWrapper)
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

  function withWrapRenderAlways (fn, ...args) {
    const result = fn.apply(this, args)
    if (this.render) {
      Object.defineProperty(this, 'render', { writable: true, value: wrapRender(this.render) })
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

  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(fn))) {
    try {
      Object.defineProperty(_fn, k, d)
    } catch (e) {}
  }

  _fn.__wrapped = fn.__wrapped = _fn

  return _fn
}

function getRenderPrototype (Component) {
  let proto = Component.prototype

  while (true) {
    if (proto.hasOwnProperty('render')) return proto
    proto = Object.getPrototypeOf(proto)
    if (!proto) return null
  }
}

function canOverrideRender (prototype) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'render')
  if (!descriptor) return true

  return descriptor.writable
}
