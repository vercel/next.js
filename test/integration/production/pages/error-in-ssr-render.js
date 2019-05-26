import React from 'react'
export default class ErrorInRenderPage extends React.Component {
  static async getInitialProps () {
    return {}
  }

  render () {
    throw new Error('An Expected error occured')
  }
}
