import './style.css'
import './global.css'

export default function DashboardLayout(props) {
  return (
    <div className="dangerous-text">
      <h1 className="green">Dashboard</h1>
      {props.children}
    </div>
  )
}

export const preferredRegion = 'iad1'
