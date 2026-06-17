import { connection } from 'next/server'

async function CachedWrapper({ children }: { children: React.ReactNode }) {
  'use cache: remote'

  return (
    <div className="wrapper">
      <p className="rand">{Math.random()}</p>
      <p className="children">{children}</p>
    </div>
  )
}

export default async function Page() {
  await connection()

  return (
    <div>
      <CachedWrapper>
        <span>Child A</span>
      </CachedWrapper>
      <CachedWrapper>
        <span>Child B</span>
      </CachedWrapper>
    </div>
  )
}
