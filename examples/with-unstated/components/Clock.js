import ClockContainer from '../containers/clock'

const pad = (n) => (n < 10 ? `0${n}` : n)

const format = (t) =>
  `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`

export default function Clock() {
  const clock = ClockContainer.useContainer()

  return (
    <div className={clock.light ? 'light' : ''}>
      {format(new Date(clock.lastUpdate))}
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
  )
}
