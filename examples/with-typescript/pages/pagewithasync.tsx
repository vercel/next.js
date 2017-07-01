import * as React from 'react'
import 'isomorphic-fetch'

interface IPageProps {
  stars: number
}

interface IPageState {
  clicked: boolean
}

export default class extends React.Component<IPageProps, IPageState> {
  static async getInitialProps() {
    const res = await fetch('https://api.github.com/repos/zeit/next.js');
    const data = await res.json();
    return { stars: data.stargazers_count }
  }
  public state: { clicked: false }
  private click = () => {
    this.setState({ clicked: true })
  }
  render() {
    return <div onClick={this.click}>
      <h1>Next has {this.props.stars} stars</h1>
      <span>{this.state.clicked ? 'clicked' : 'please click'}</span>
    </div>
  }
}