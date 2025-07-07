const error = new Error('test')
export default function Page() {
  console.error(error)
  return <p>hello world</p>
}
