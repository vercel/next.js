import ClientComp from './client-comp.client'
export default function DashboardPage(props) {
  return (
    <>
      <p className="p">hello from app/dashboard</p>
      <p className="green">this is green</p>
      <ClientComp />
    </>
  )
}
