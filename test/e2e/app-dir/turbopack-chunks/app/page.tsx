export default async function Page() {
  const result = await fetch('http://localhost:3000/api')
  const data = await result.json()

  console.log(data)

  return <div>{data}</div>
}
