import React, {Component} from 'react'
import Head from 'next/head'
import { connect } from 'react-redux'
import Logo from '../utils/Logo'
import Form from './Form'

class Main extends Component {
  componentWillUpdate (nextProps) {
    if (nextProps.nameReducer.name) {
      document.location.pathname = '/profile'
    }
  }

  render () {
    return (
      <div>
        <Head>
          <title>Create Name</title>
          <link rel='stylesheet' href='https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css' />
        </Head>
        <div>
          <Logo />
          <Form />
        </div>
      </div>
    )
  }
}

const mapStateToProps = ({ nameReducer }) => {
  return {
    nameReducer
  }
}

export default connect(mapStateToProps)(Main)
