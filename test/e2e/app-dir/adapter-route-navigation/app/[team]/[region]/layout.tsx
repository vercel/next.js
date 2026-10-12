import { Suspense, type ReactNode } from 'react'

export function generateStaticParams() {
  return [
    { team: 'acme', region: 'east' },
    { team: 'acme', region: 'west' },
    { team: 'sparse', region: 'east' },
    { team: 'cash$2', region: 'east' },
    { team: 'cash$3', region: 'east' },
  ]
}

async function RootParams({
  params,
}: {
  params: Promise<{ team: string; region: string }>
}) {
  const { team, region } = await params
  return <p id="root-params">{`${team}:${region}`}</p>
}

export default function Root({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ team: string; region: string }>
}) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading root parameters</p>}>
          <RootParams params={params} />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
