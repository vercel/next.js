import React from 'react'

export default class extends React.Component {
  constructor (props) {
    super(props)
    this.state = { response: '' }
  }

  static async getInitialProps ({ pathname, query }) {
    return {
      pathname,
      query,
      queryString: Object.keys(query).join('')
    }
  }

  async componentDidMount () {
    const response = JSON.stringify(
      await window
        .fetch(`/api/${this.props.queryString}`)
        .then(response => response.json().then(data => data)),
      null,
      2
    )
    this.setState({ response })
  }

  render () {
    return (
      <content>
        <p>
          /api/{this.props.queryString} routed to https://swapi.co/api/{this.props.queryString}
        </p>
        <p>
          <a href='?people/2'>Try</a>
          &nbsp;
          <a href='/'>Reset</a>
        </p>
        <pre>
          {this.state.response ? this.state.response : 'Loading...'}
        </pre>
      </content>
    )
  }
}
