import React, {Component} from 'react'
import Head from 'next/head'
import Header from '../utils/Header'
import NavBar from '../utils/NavBar'

class Main extends Component {
  render () {
    const { pathname } = this.props.url
    return (
      <div>
        <Head>
          <title>Profile</title>
          <link rel='stylesheet' href='https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css' />
        </Head>
        <Header pathname={pathname} />
        <NavBar />
      </div>
    )
  }
}

export default Main
