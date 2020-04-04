import React, { Component } from 'react'
import Link from 'next/link'
import { inject, observer } from 'mobx-react'
import Clock from './Clock'
import { store } from '../stores/store'

@inject('store')
@observer
class SampleComponent extends Component {
  componentDidMount() {
    store.start()
  }

  componentWillUnmount() {
    store.stop()
  }

  render() {
    const { title, linkTo } = this.props
    return (
      <div>
        <h1>{title}</h1>
        <Clock lastUpdate={store.lastUpdate} light={store.light} />
        <nav>
          <Link href={linkTo}>
            <a>Navigate</a>
          </Link>
        </nav>
      </div>
    )
  }
}

export default SampleComponent
