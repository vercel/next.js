export default async function HeaderSegmentPage({ params }) {
  const { segment } = await params
  return (
    <div id="header-segment-page">
      <p>@header/[segment]: {segment}</p>
    </div>
  )
}
