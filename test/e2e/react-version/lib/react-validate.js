import React from 'react'
import ReactDOM from 'react-dom'

function getReactConditionByModule(React_) {
  const React = Object(React_)
  const isReactServer =
    React.useState === undefined &&
    React.useEffect === undefined &&
    React.version !== undefined &&
    React.useId !== undefined
  return isReactServer ? 'react-server' : 'default'
}

function getReactDomConditionByModule(ReactDOM_) {
  const ReactDOM = Object(ReactDOM_)
  const isReactServer =
    ReactDOM.useFormState === undefined && ReactDOM.preload !== undefined
  return isReactServer ? 'react-server' : 'default'
}

export function getReactCondition() {
  return getReactConditionByModule(React)
}

export function getReactDomCondition() {
  return getReactDomConditionByModule(ReactDOM)
}
