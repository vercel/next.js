import React from 'react'

class Index extends React.Component {
  static getInitialProps ({ query }) {
    if (query.raiseError) {
      throw new Error('Error in getInitialProps')
    }
  }

  state = {
    raiseErrorInRender: false,
    raiseErrorInUpdate: false
  };

  componentDidUpdate () {
    if (this.state.raiseErrorInUpdate) {
      throw new Error('Error in componentDidUpdate')
    }
  }

  raiseErrorInUpdate = () => this.setState({ raiseErrorInUpdate: '1' });
  raiseErrorInRender = () => this.setState({ raiseErrorInRender: '1' });

  render () {
    if (this.state.raiseErrorInRender) {
      throw new Error('Error in render')
    }

    return (
      <div>
        <h2>Sentry Example 🚨</h2>
        <ul>
          <li>
            <a href='#' onClick={this.raiseErrorInRender}>
              Raise the error in render
            </a>
          </li>
          <li>
            <a href='#' onClick={this.raiseErrorInUpdate}>
              Raise the error in componentDidUpdate
            </a>
          </li>
        </ul>
      </div>
    )
  }
}

export default Index
