export default async function SegmentPage({ params }) {
  const { segment } = await params
  return (
    <div id="segment-page">
      <p>/[segment]: {segment}</p>
    </div>
  )
}
