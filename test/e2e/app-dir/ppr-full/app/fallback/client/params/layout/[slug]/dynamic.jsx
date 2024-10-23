export default async function Dynamic(props) {
  const { slug } = await props.params
  return <div data-file="app/fallback/client/params/[slug]/dynamic">{slug}</div>
}
