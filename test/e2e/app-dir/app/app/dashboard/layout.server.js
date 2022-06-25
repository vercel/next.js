export default function DashboardLayout(props) {
  return (
    <>
      <h1>Dashboard</h1>
      <div style={{ backgroundColor: 'red' }}>{props.children}</div>
      <div style={{ backgroundColor: 'blue' }}>{props.custom}</div>
    </>
  )
}
