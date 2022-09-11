// @ts-ignore
import { experimental_use as use } from 'react'

const fetchCategory = async (categorySlug: string): Promise<{}> => {
  // artificial delay
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return categorySlug + 'abc'
}

export default function Page({
  params,
}: {
  params: { [key: string]: string }
}) {
  const category = use(fetchCategory(params.categorySlug))

  return (
    <>
      <div className="space-y-4">
        <div className="text-xl font-medium text-zinc-500">{category}</div>
      </div>
    </>
  )
}
