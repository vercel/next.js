import type { ReactNode } from 'react'

import { theme } from '../../../variants'

export function unstable_generateStaticVariants() {
  return [[[theme, 'dark']]]
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
