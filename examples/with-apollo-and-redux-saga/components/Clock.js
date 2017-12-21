import React from 'react'

const pad = n => (n < 10 ? `0${n}` : n)

const format = t => {
  const hours = t.getUTCHours()
  const minutes = t.getUTCMinutes()
  const seconds = t.getUTCSeconds()
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function Clock ({ lastUpdate, light }) {
  return (
    <React.Fragment>
      <h2>Clock:</h2>
      <div className={light ? 'light' : ''}>
        {format(new Date(lastUpdate || Date.now()))}
        <style jsx>{`
          div {
            padding: 15px;
            display: inline-block;
            color: #82fa58;
            font: 50px menlo, monaco, monospace;
            background-color: #000;
          }
          .light {
            background-color: #999;
          }
        `}</style>
      </div>
    </React.Fragment>
  )
}

export default Clock
