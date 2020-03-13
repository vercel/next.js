import { Component } from 'react'
import Header from '../components/Header'
import Router from 'next/router'

export default class extends Component {
  static getInitialProps() {
    console.log(Router.pathname)
    return {}
  }

  render() {
    return (
      <div>
        <Header />
        <p>This should not be rendered via SSR</p>
      </div>
    )
  }
}
