import React, { Component } from 'react'
import { connect } from 'react-redux'

class Clock extends Component {
  componentDidMount () {
    this.timer = this.props.dispatch(startClock())
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    const { lastUpdate, light } = this.props
    return (
      <div className={light ? 'light' : ''}>
        {format(new Date(lastUpdate))}
        <style jsx>{`
          div {
            padding: 15px;
            display: inline-block;
            color: #82FA58;
            font: 50px menlo, monaco, monospace;
            background-color: #000;
          }

          .light {
            background-color: #999;
          }
        `}</style>
      </div>
    )
  }
}

const format = t => `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`

const pad = n => n < 10 ? `0${n}` : n

export default connect(state => state.globalClock)(Clock)

export const reducer = (state = { lastUpdate: 0, light: false }, action) => {
  switch (action.type) {
    case 'TICK':
      return { lastUpdate: action.ts, light: !!action.light }
    default:
      return state
  }
}

export const startClock = () => dispatch => {
  return setInterval(() => dispatch({ type: 'TICK', light: true, ts: Date.now() }), 800)
}
