import ShortCache from '../../components/short-cache'

export default function Page() {
  return <ShortCache profile={{ stale: 29, revalidate: 300, expire: 600 }} />
}
