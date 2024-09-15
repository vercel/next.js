const errorContent = await Promise.resolve('hello error')

function Error({ statusCode }) {
  return <p id="content-error">{errorContent}</p>
}

export default Error
