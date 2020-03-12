export default () => {
  if (typeof window !== 'undefined') {
    window.didRender = true
  }

  return (
    <>
      <p>hi</p>
      <script src="/regexp-test.js" />
    </>
  )
}
