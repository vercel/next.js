export default function Page() {
  return (
    <>
      <p id="page">index page</p>
    </>
  )
}

export async function Head() {
  return (
    <>
      <script async src="/hello.js" />
      {/* TODO-APP: enable after react is updated to handle
      other head tags
      <title>hello from index</title>
      <meta name="description" content="an index page" /> */}
    </>
  )
}
