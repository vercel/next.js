export default function Page() {
  const foobar = process.env.foo + process.env.bar
  return <p>{foobar}</p>
}
