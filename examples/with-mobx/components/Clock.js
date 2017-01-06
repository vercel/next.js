import React from 'react'
import { inject, observer } from 'mobx-react'

const Clock = inject('store')(observer(({store}) => {
  return (
    <div className={store.light ? 'light' : ''}>
      {format(new Date(store.lastUpdate))}
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
}))

const format = t => `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`

const pad = n => n < 10 ? `0${n}` : n

export default Clock
