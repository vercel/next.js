import './style.css'

export default function DashboardLayout(props) {
  return (
    <>
      <h1 className="green">Dashboard</h1>
      {props.children}
    </>
  )
}
