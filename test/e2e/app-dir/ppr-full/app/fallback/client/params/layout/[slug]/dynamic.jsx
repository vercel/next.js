export default function Dynamic({ params }) {
  console.log('typeof params', typeof params)
  return (
    <div data-file="app/fallback/client/params/[slug]/dynamic">
      {params.slug}
    </div>
  )
}
