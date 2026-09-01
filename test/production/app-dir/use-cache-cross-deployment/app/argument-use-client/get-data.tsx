export async function getData(Client) {
  'use cache: remote'

  return (
    <div>
      <span id="data">{Math.random()}</span>
      <Client />
    </div>
  )
}
