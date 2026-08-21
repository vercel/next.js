import message from '../../symlinked-package/dist/serialization'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <p>{message}</p>
    </>
  )
}
