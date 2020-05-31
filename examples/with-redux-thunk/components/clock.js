import { useSelector } from 'react-redux'

const formatTime = (time) => {
  return new Date(time).toJSON().slice(11, 19)
}

const Clock = () => {
  const lastUpdate = useSelector((state) => state.timer.lastUpdate)
  const light = useSelector((state) => state.timer.light)
  return (
    <div className={light ? 'light' : ''}>
      {formatTime(lastUpdate)}
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

export default Clock
