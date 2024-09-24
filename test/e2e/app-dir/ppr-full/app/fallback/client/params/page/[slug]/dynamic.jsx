export default function Dynamic({ params }) {
  return (
    <div data-file="app/fallback/client/params/[slug]/dynamic">
      {params.slug}
    </div>
  )
}
