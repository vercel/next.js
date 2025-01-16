import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { baseOptions } from '@/app/layout.config'
import { source } from '@/lib/source'
import { Body } from './layout.client'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Body>
      <DocsLayout
        tree={source.pageTree}
        {...baseOptions}
        sidebar={{
          tabs: {
            transform: (option) => {
              if (option.url === '/docs/app') {
                return {
                  ...option,
                  icon: (
                    <span className="border border-blue-600/50 bg-gradient-to-t from-blue-600/50 rounded-lg p-1 text-blue-600">
                      {option.icon}
                    </span>
                  ),
                }
              }

              if (option.url === '/docs/pages') {
                return {
                  ...option,
                  icon: (
                    <span className="border purple-blue-600/50 bg-gradient-to-t from-purple-600/50 rounded-lg p-1 text-purple-600">
                      {option.icon}
                    </span>
                  ),
                }
              }
              return option
            },
          },
        }}
      >
        {children}
      </DocsLayout>
    </Body>
  )
}
