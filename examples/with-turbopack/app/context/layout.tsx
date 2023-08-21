import { getCategories } from '#/app/api/categories/getCategories'
import { Boundary } from '#/ui/boundary'
import { TabGroup } from '#/ui/tab-group'
import { CounterProvider } from 'app/context/counter-context'
import React from 'react'
import ContextClickCounter from './context-click-counter'

export const metadata = {
  title: 'Client Context',
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = await getCategories()
  return (
    <Boundary
      labels={['Server Component Boundary']}
      size="small"
      animateRerendering={false}
    >
      <Boundary
        labels={['Counter Context Provider [Client Component]']}
        color="blue"
        size="small"
        animateRerendering={false}
      >
        <CounterProvider>
          <Boundary
            labels={['Server Component Boundary']}
            size="small"
            animateRerendering={false}
          >
            <div className="space-y-9">
              <div className="flex justify-between">
                <TabGroup
                  path="/context"
                  items={[
                    {
                      text: 'Home',
                    },
                    ...categories.map((x) => ({
                      text: x.name,
                      slug: x.slug,
                    })),
                  ]}
                />
              </div>

              <ContextClickCounter />
              <div>{children}</div>
            </div>
          </Boundary>
        </CounterProvider>
      </Boundary>
    </Boundary>
  )
}
