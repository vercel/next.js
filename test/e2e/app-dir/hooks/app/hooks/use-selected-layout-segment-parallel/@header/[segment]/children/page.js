export default async function HeaderSegmentChildrenPage({ params }) {
  const { segment } = await params
  return (
    <div id="header-segment-children-page">
      <p>@header/[segment]/children: {segment}/children</p>
    </div>
  )
}
