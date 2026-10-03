import dynamic from 'next/dynamic'

// Imported by both routers, so it exists once per client layer. Its dynamic()
// is the manifest entry that used to be overwritten by the App Router copy.
const Lazy = dynamic(() => import('./Lazy'))

export default function Shared({ router }) {
  return (
    <section>
      <h1>rendered by the {router} router</h1>
      <Lazy />
    </section>
  )
}
