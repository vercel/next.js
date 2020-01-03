import React, { FC } from 'react'

import { RootStore } from '../store'

const format = (t: Date) =>
  `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
const pad = (n: number) => (n < 10 ? `0${n}` : n)

interface Props extends Pick<RootStore, 'lastUpdate' | 'light'> {}

const Clock: FC<Props> = props => {
  const divStyle = {
    backgroundColor: props.light ? '#999' : '#000',
    color: '#82FA58',
    display: 'inline-block',
    font: '50px menlo, monaco, monospace',
    padding: '15px',
  }
  return (
    <div style={divStyle}>{format(new Date(props.lastUpdate as number))}</div>
  )
}

export { Clock }
