export default function CatchAll({
  params,
}: {
  params: { segments: string[] }
}) {
  // return null;
  return <div>This is a catch-all route: {JSON.stringify(params.segments)}</div>
}
