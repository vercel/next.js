export const dynamic = 'force-dynamic'

export default function Page({ params }) {
  throw new Error('this should not attempt prerendering with force-dynamic')
}
