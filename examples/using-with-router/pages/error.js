import {Component} from 'react'
import Header from '../components/Header'
import Router from 'next/router'

export default class extends Component {
  render () {
    return (
      <div>
        <Header />
        <p>This path({Router.pathname}) should not be rendered via SSR</p>
      </div>
    )
  }
}
