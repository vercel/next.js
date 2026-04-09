import { rootParam } from 'next/root-params'

/**
 * Page that accesses rootParam via the next/root-params API.
 *
 * This tests that root param access is tracked in varyParams. When accessing
 * /aaa vs /bbb, each should trigger a separate prefetch because rootParam
 * is accessed via next/root-params.
 */
export default async function RootParamsPage() {
  const param = await rootParam()

  return (
    <div id="root-params-page">
      <div data-root-param-content="true">
        {`Root param page content - param: ${param}`}
      </div>
    </div>
  )
}
