import dynamic from 'next/dynamic'

const DynWidget = dynamic(
  () => import(/* turbopackChunkName: "pages-dyn-widget" */ '../lib/dyn-widget')
)

export default function Page() {
  return (
    <main>
      <DynWidget />
    </main>
  )
}
