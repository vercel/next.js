export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders a deep tree of async server components. There is no
        async IO so they are still prerenderable
      </p>
      <Foo>
        <Bar>1</Bar>
        <Bar>2</Bar>
        <Bar>
          <Foo>
            <Bar>a</Bar>
            <Bar>b</Bar>
            <Bar>c</Bar>
          </Foo>
        </Bar>
        <Bar>3</Bar>
        <Bar>4</Bar>
      </Foo>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function Foo({ children }) {
  await 1
  await 1
  return <ul>Foo: {children}</ul>
}

async function Bar({ children }) {
  let length = (Math.random() * 10) | 0
  for (let i = 0; i < length; i++) {
    await 1
  }
  return <li>Bar: {children}</li>
}
