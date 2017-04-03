import * as React from 'react'
import 'isomorphic-fetch'
interface pagesProps {
  stars: number
}
interface pageState {
  clicked: boolean
}
export default class extends React.Component<pagesProps, pageState> {
  static async getInitialProps() {
    const res = await fetch('https://api.github.com/repos/zeit/next.js');
    const data = await res.json();
    return { stars: data.stargazers_count }
  }
  constructor() {
    super();
    this.state = { clicked: false }
  }
  click() {
    this.setState({ clicked: true })
  }
  render() {
    return <div onClick={this.click.bind(this)}>
      <h1>Next has {this.props.stars} stars</h1>
      <span>{this.state.clicked ? 'clicked' : 'please click'}</span>
    </div>
  }
}