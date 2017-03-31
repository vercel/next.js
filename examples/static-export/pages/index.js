import { Component } from 'react'
import Button from '../ui/button'
import Link from 'next/link'

export default class Index extends Component {
  constructor (props) {
    super(props)
    this.state = {
      answer: ''
    }
  }

  static async getInitialProps ({ pathname }) {
    return {
      title: 'Hello Static Stack!'
    }
  }

  render () {
    return (
      <div>
        <h2>{this.props.title}</h2>
        <Link href='/about'><a>Learn more about me</a></Link>
        <br />
        <br />
        <Button onClick={() => this.setState({ answer: 'yes.' })}>
          Did Rehydration Work?
        </Button>
        <br />
        <br />
        <div>{this.state.answer}</div>
        <br />
        <Link href='/movies'><a>Check out the movies</a></Link>
      </div>
    )
  }
}
