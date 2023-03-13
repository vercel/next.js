/* eslint-disable */
import { Component } from 'react'
import { RendererProvider } from 'react-fela'
import getFelaRenderer from './getFelaRenderer'

const fallbackRenderer = getFelaRenderer()

export default class FelaProvider extends Component {
  render() {
    const renderer = this.props.renderer || fallbackRenderer
    return (
      <RendererProvider renderer={renderer}>
        {this.props.children}
      </RendererProvider>
    )
  }
}
