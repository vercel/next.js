export default () => {
  if (typeof window !== 'undefined') {
    window.didRender = true
  }
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: 'window.Promise = undefined' }}
      />
    </>
  )
}
