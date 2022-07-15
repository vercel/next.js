import Link from 'next/link'
import ClientComp from './client-comp.client'
export default function DashboardPage(props) {
  return (
    <>
      <p id="from-dashboard" className="p">
        hello from app/dashboard
      </p>
      <p className="green">this is green</p>
      <ClientComp />
      <br />
      <Link href="/dashboard/index">
        <a>go to /dashboard/index</a>
      </Link>
      <br />
      <Link href="/slow-page-with-loading">
        <a>go to /slow-page-with-loading</a>
      </Link>
    </>
  )
}
