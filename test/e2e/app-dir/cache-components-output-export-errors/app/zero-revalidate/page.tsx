import ShortCache from '../../components/short-cache'

export default function Page() {
  return <ShortCache profile={{ stale: 300, revalidate: 0, expire: 600 }} />
}
