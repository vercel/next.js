export default async function Page() {
  const secret = (await fetch('http://fake.url/secret').then((res) =>
    res.text()
  )) as any
  const magicNumber = (await fetch('http://fake.url/magic-number').then((res) =>
    res.text()
  )) as any

  return (
    <>
      <div id="update">touch to trigger HMR</div>
      <div id="secret">{secret}</div>
      <div id="magic-number">{magicNumber}</div>
    </>
  )
}
