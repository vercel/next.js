import { getCachedData } from './cached-data'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <h1>Layout</h1>
      <p id="layout-data">{await getCachedData()}</p>
      <div>{children}</div>
    </>
  )
}
