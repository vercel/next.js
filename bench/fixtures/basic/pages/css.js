import React, { Component } from 'react'
import { style } from 'next/css'

export default class CrazyCSS extends Component {
  spans () {
    const out = []
    for (let i = 0; i < 1000; i++) {
      out.push(<span key={i} class={spanStyles[`padding-${i}`]}>This is ${i}</span>)
    }
    return out
  }

  render () {
    return <div>{this.spans()}</div>
  }
}

const spanStyles = {}
for (let i = 0; i < 1000; i++) {
  spanStyles[`padding-${i}`] = style({ padding: i })
}
