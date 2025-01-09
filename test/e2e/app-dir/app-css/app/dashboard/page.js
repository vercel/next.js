import ClientComp from './client-comp-client'

export default function DashboardPage(props) {
  return (
    <>
      <p id="from-dashboard" className="p">
        hello from app/dashboard
      </p>
      <p className="bold">BOLD</p>
      <p className="green">this is green</p>
      <ClientComp />
    </>
  )
}

export const runtime = 'edge'
