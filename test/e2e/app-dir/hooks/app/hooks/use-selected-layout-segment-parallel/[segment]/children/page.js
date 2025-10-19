export default async function ChildrenPathnamePage({ params }) {
  const { segment } = await params
  return (
    <div id="segment-children-page">
      <p>/[segment]/children: {segment}/children</p>
    </div>
  )
}
