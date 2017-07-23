import { Component } from 'react'
import _static from 'next/static'

export default class Index extends Component {
  state = {
    white: true
  }

  render () {
    const { white } = this.state
    const logoSrc = white
      ? _static('white-logo.svg')
      : _static('black-logo.svg')

    return (
      <div
        onClick={() => this.setState({ white: !this.state.white })}
        style={{ background: white ? 'white' : 'black' }}>
        <img src={logoSrc} />
        <style jsx>
          {`
            :global(body) {
              margin: 0;
              padding: 0;
            }
            div {
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              width: 100vw;
              transition: background 1s;
            }
          `}
        </style>
      </div>
    )
  }
}
