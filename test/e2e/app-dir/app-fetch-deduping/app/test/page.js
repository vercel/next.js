async function getTime() {
  const res = await fetch(`http://localhost:3000/api/time`)
  return res.text()
}

export default async function Home() {
  await getTime()
  await getTime()
  const time = await getTime()

  return <h1>{time}</h1>
}
