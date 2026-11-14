import ShortCache from '../../components/short-cache'

export default function Page() {
  return <ShortCache profile={{ stale: 30, revalidate: 60, expire: 299 }} />
}
