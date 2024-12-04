import Dynamic from './dynamic'

export default async function Page(props) {
  const params = await props.params
  return (
    <div data-file="app/fallback/client/params/[slug]/page">
      <Dynamic params={params} />
    </div>
  )
}
