export default async function Page({ params }) {
  const { catchAll = [] } = await params
  return (
    <div id="slot">
      <h1>Parallel Route!</h1>
      <ul>
        <li>Artist: {catchAll[0]}</li>
        <li>Album: {catchAll[1] ?? 'Select an album'}</li>
        <li>Track: {catchAll[2] ?? 'Select a track'}</li>
      </ul>
    </div>
  )
}
