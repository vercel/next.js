import Dynamic from './dynamic'

export default function Page({ params }) {
  return (
    <div data-file="app/fallback/client/params/[slug]/page">
      <Dynamic params={params} />
    </div>
  )
}
