import React from 'react'
export default class extends React.Component {
  static async getInitialProps({ res }) {
    if (res) {
      res.setHeader('Content-Type', 'text/html; charset=iso-8859-2')
    }
    return {}
  }

  render() {
    return null
  }
}
