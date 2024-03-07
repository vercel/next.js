export default function Page() {
  const foobarbaz = process.env.foo + process.env.bar + process.env.baz
  return <p>{foobarbaz}</p>
}
