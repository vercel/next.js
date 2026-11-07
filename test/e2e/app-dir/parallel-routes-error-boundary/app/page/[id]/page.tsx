export default function DynamicChildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <div id="dynamic-child">Dynamic Child</div>
}
