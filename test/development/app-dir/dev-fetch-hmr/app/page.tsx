export default async function Page() {
  // touch to trigger HMR
  const secret = (await fetch('secret')) as any
  const magicNumber = (await fetch('magic-number')) as any
  return (
    <>
      <div id="secret">{secret}</div>
      <div id="magic-number">{magicNumber}</div>
    </>
  )
}
