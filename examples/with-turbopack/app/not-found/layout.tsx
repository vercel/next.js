import { getCategories } from '#/app/api/categories/getCategories'
import { ClickCounter } from '#/ui/click-counter'
import { TabGroup } from '#/ui/tab-group'
import React from 'react'

export const metadata = {
  title: 'Not Found',
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = await getCategories()

  return (
    <div className="space-y-9">
      <div className="flex justify-between">
        <TabGroup
          path="/not-found"
          items={[
            {
              text: 'Home',
            },
            ...categories.map((x) => ({
              text: x.name,
              slug: x.slug,
            })),
            {
              text: 'Category That Does Not Exist',
              slug: 'does-not-exist',
            },
          ]}
        />

        <div className="self-start">
          <ClickCounter />
        </div>
      </div>

      <div>{children}</div>
    </div>
  )
}
