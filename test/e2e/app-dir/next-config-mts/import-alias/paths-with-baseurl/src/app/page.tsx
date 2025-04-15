export default function Page() {
  return <p>{`${process.env.foo + process.env.bar}`}</p>
}
