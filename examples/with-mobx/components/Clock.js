import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { useStore } from '../store'

export default observer(function Clock() {
  const { start, stop, light, timeString } = useStore()
  useEffect(() => {
    start()
    return () => stop()
  }, [start, stop])
  return (
    <div className={light ? 'light' : ''}>
      {timeString}
      <style jsx>{`
        div {
          padding: 15px;
          color: #82fa58;
          display: inline-block;
          font: 50px menlo, monaco, monospace;
          background-color: #000;
        }

        .light {
          background-color: #999;
        }
      `}</style>
    </div>
  )
})
