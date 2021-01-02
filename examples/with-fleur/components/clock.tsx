import { useStore } from '@fleur/react'
import { TimerStore } from '../domains/timer'

const useClock = () => {
  return useStore((getStore) => ({
    lastUpdate: getStore(TimerStore).state.lastUpdate,
    light: getStore(TimerStore).state.light,
  }))
}

const formatTime = (time: number) => {
  // cut off except hh:mm:ss
  return new Date(time).toJSON().slice(11, 19)
}

export const Clock = () => {
  const { lastUpdate, light } = useClock()
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
