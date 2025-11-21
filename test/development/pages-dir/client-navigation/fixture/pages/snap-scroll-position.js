import React from 'react'

export default class SnapScrollPosition extends React.Component {
  constructor(props) {
    super(props)
    this.state = { positionY: -1 }
  }

  componentDidMount() {
    this.setState({ positionY: window.scrollY })
  }

  render() {
    return (
      <main>
        {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
          return (
            <div key={`item-${i}`} id={`item-${i}`}>
              {i}
            </div>
          )
        })}

        <span id="scroll-pos-y">{this.state.positionY}</span>
      </main>
    )
  }
}
