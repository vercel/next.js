export default async function Page() {
  const randomNumber = Math.random()
  return (
    <div>
      <div>LOADING</div>
      <div id="loading">{randomNumber}</div>
    </div>
  )
}
