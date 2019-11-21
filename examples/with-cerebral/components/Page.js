import React from 'react'
import Link from 'next/link'
import { connect } from '@cerebral/react'
import { state, signal } from 'cerebral/tags'
import Clock from './Clock'

export default connect(
  {
    lastUpdate: state`clock.lastUpdate`,
    light: state`clock.light`,
    mounted: signal`clock.mounted`,
    unMounted: signal`clock.unMounted`,
  },
  class Page extends React.Component {
    componentDidMount() {
      this.props.mounted()
    }

    componentWillUnmount() {
      this.props.unMounted()
    }
    render() {
      return (
        <div>
          <h1>{this.props.title}</h1>
          <Clock lastUpdate={this.props.lastUpdate} light={this.props.light} />
          <nav>
            <Link href={this.props.linkTo}>
              <a>Navigate</a>
            </Link>
          </nav>
        </div>
      )
    }
  }
)
