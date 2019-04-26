/* eslint-disable */
import { Component } from 'react'
import PropTypes from 'prop-types'

import { RendererProvider } from 'react-fela'
import getFelaRenderer from './getFelaRenderer'

const clientRenderer = getFelaRenderer()

export default class FelaProvider extends Component {
  static contextTypes = {
    renderer: PropTypes.object
  }

  render() {
    if (this.context.renderer) {
      return this.props.children
    }

    const renderer = this.props.renderer || clientRenderer
    return (
      <RendererProvider renderer={renderer}>
        {this.props.children}
      </RendererProvider>
    )
  }
}
