export default function Page() {
  return (
    <>
      <p id="page">blog page</p>
    </>
  )
}

export async function Head() {
  return (
    <>
      <script async src="/hello3.js" />
      {/* TODO-APP: enable after react is updated to handle
      other head tags
      <title>hello from blog page</title> */}
    </>
  )
}
