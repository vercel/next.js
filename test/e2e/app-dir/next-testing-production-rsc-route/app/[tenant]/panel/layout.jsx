export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export default function Layout({ children, activity, metrics }) {
  return (
    <main data-parallel-layout="default-slots">
      <section data-slot="children">{children}</section>
      <section data-slot="activity">{activity}</section>
      <section data-slot="metrics">{metrics}</section>
    </main>
  )
}
