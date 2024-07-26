export default async function Page() {
  // touch to trigger HMR
  const secret = (await fetch('http://fake.url/secret').then((res) =>
    res.text()
  )) as any
  const magicNumber = (await fetch('http://fake.url/magic-number').then((res) =>
    res.text()
  )) as any

  return (
    <>
      <div id="secret">{secret}</div>
      <div id="magic-number">{magicNumber}</div>
    </>
  )
}
