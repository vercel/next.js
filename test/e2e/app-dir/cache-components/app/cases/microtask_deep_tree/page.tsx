import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders a deep tree of deeply async components that still
        resolve within microtasks.
      </p>
      <p>With PPR this page should be entirely static.</p>
      <p>Without PPR this page should be static.</p>
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
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function Foo({ children }) {
  await 1
  await 1
  return <ul>Foo: {children}</ul>
}

async function Bar({ children }) {
  let length = 7
  for (let i = 0; i < length; i++) {
    await 1
  }
  return <li>Bar: {children}</li>
}
