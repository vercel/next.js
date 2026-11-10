import { rootParam } from 'next/root-params'

type Params = { rootParam: string }

/**
 * Root layout for the root params test.
 *
 * This layout is the first layout in its route tree (no app/layout.tsx above it),
 * which makes `rootParam` a "root param" accessible via `next/root-params`.
 *
 * The layout accesses rootParam via the next/root-params API to verify that
 * root param access is properly tracked in varyParams.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ rootParam: 'aaa' }, { rootParam: 'bbb' }]
}

export default async function RootParamsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const param = await rootParam()

  return (
    <html>
      <body>
        <div data-root-params-layout="true">
          <div data-root-param={param}>
            {`Root param layout - param: ${param}`}
          </div>
          {children}
        </div>
      </body>
    </html>
  )
}
