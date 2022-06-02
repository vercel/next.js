import { observer } from 'mobx-react'
const Clock = observer((props) => {
  return (
    <div className={props.light ? 'light' : ''}>
      {props.timeString}
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
export default Clock
