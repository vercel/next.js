import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <Suspense>
      <Container>
        <Content />
      </Container>
    </Suspense>
  )
}

function Container({ children }) {
  return <div>{children}</div>
}

async function Content() {
  await connection()

  if (!globalThis.__nextTestRecover) {
    throw new Error('this is a test')
  }

  return <p id="recover">Recovered</p>
}
