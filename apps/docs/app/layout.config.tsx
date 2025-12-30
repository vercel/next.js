import { NEXTJS } from '@/constants/brand'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

/**
 * Shared layout configurations
 *
 * you can customize layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <>{NEXTJS}</>,
  },
  // see https://fumadocs.dev/docs/ui/navigation/links
  links: [],
}
