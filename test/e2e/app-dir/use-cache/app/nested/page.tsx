async function Inner() {
  'use cache'

  return <p className="inner">{Math.random()}</p>
}

async function Outer1() {
  'use cache'

  return <Inner />
}

async function Outer2() {
  'use cache'

  return <Inner />
}

export default function Page() {
  return (
    <>
      <Outer1 />
      <Outer2 />
    </>
  )
}
