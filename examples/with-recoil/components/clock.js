import { useRecoilValue } from 'recoil'
import { timeState } from '../lib/recoil-atoms'

const useClock = () => {
  const time = useRecoilValue(timeState)
  return { time }
}

const Clock = () => {
  const { time } = useClock()
  return (
    <div>
      {time}
      <style jsx>{`
        div {
          padding: 15px;
          display: inline-block;
          color: #82fa58;
          font: 50px menlo, monaco, monospace;
          background-color: #000;
        }
      `}</style>
    </div>
  )
}

export default Clock
