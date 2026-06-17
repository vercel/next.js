async function Bar() {
  'use cache'
  const date = new Date().toLocaleTimeString()
  console.log('deep inside', date)
  return <p>{date}</p>
}

async function Foo() {
  'use cache'
  console.log('inside')
  return <Bar />
}

export default async function Page() {
  console.log('outside')

  return <Foo />
}
