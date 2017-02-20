/* global localStorage */
import React, { Component } from 'react'
import Router, { _reload } from 'next/router'

let counter = 0

export default class extends Component {

  increase () {
    counter++
    this.forceUpdate()
  }

  render () {
    return (
      <div className='force-reload'>
        <div id='counter'>
          Counter: {counter}
        </div>
        <button id='increase' onClick={() => this.increase()}>Increase</button>
        <button id='reload' onClick={() => _reload()}>Reload</button>
      </div>
    )
  }
}

Router.onBeforeReload = function (key) {
  localStorage.setItem(key, counter)
}

Router.onAfterReload = function (key) {
  counter = parseInt(localStorage.getItem(key))
}
