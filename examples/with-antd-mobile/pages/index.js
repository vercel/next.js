import { Component } from 'react'

export default class Index extends Component {
  static async getInitialProps ({ res }) {
    res.setHeader('Location', '/home')
    res.statusCode = 302
    res.end()
  }
}
