function CircularJSONErrorPage() {
  return <div>This won't render</div>
}

CircularJSONErrorPage.getInitialProps = () => {
  // This creates a circular JSON object
  const object = {}
  object.arr = [object, object]
  object.arr.push(object.arr)
  object.obj = object

  return object
}

export default CircularJSONErrorPage
