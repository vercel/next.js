import { TabGroup } from '#/ui/tab-group'
import React from 'react'

export const metadata = {
  title: 'Incremental Static Regeneration (ISR)',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const ids = [{ id: '1' }, { id: '2' }, { id: '3' }]

  return (
    <div className="space-y-9">
      <TabGroup
        path="/isr"
        items={[
          {
            text: 'Home',
          },
          ...ids.map((x) => ({
            text: `Post ${x.id}`,
            slug: x.id,
          })),
        ]}
      />

      <div>{children}</div>
    </div>
  )
}
