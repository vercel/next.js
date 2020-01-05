import React from 'react'
export default class ErrorInRenderPage extends React.Component {
  static async getInitialProps() {
    return {}
  }

  // eslint-disable-next-line react/require-render-return
  render() {
    throw new Error('An Expected error occured')
  }
}
