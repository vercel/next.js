export default function Layout({ children }) {
  return (
    <>
      <p id="layout">blog layout</p>
      {children}
    </>
  )
}

export async function Head() {
  return (
    <>
      <script async src="/hello1.js" />
      <script async src="/hello2.js" />
      {/* TODO-APP: enable after react is updated to handle
      other head tags
      <title>hello from blog layout</title>
      <meta name="description" content="a neat blog" /> */}
    </>
  )
}
