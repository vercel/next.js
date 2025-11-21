function throwServerError() {
  throw new Error('Server component error in app router')
}

function callServerError() {
  throwServerError()
}

export default function ServerErrorPage() {
  callServerError()

  return <div></div>
}
