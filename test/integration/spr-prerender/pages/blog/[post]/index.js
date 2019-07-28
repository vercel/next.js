import React from 'react'

export const config = { experimentalPrerender: true }

export default class Post extends React.Component {
  static getInitialProps() {
    return {
      time: new Date().getTime()
    }
  }

  render() {
    return <p>Current time: {this.props.time}</p>
  }
}
