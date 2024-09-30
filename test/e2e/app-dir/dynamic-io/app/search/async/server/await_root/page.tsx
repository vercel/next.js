import { getSentinelValue } from '../../../../getSentinelValue'

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <>
      <p>
        This page awaits the searchParams promise before accessing a property on
        it.
      </p>
      <p>There use is not wrapped in a Suspense boundary</p>
      <p>With PPR we expect the page to have an empty shell</p>
      <p>Without PPR we expect the page to be dynamic</p>
      <Component searchParams={searchParams} />
      <ComponentTwo />
    </>
  )
}

async function Component({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  const params = await searchParams
  return (
    <>
      <div>
        This component accessed `searchParams.sentinel`: "
        <span id="value">{params.sentinel}</span>"
      </div>
      <span id="page">{getSentinelValue()}</span>
    </>
  )
}

function ComponentTwo() {
  return null
}
