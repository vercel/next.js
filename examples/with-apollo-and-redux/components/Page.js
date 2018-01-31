import { connect } from 'react-redux'
import Clock from './Clock'
import AddCount from './AddCount'

export default connect(state => state)(({ title, lastUpdate, light }) => {
  return (
    <div>
      <h1>Redux: {title}</h1>
      <Clock lastUpdate={lastUpdate} light={light} />
      <AddCount />
      <style jsx>{`
        h1 {
          font-size: 20px;
        }
      `}</style>
    </div>
  )
})
