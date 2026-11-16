import { notFound } from 'next/navigation'

export const markdown = '# Should not be served\n'

export default function Page() {
  notFound()
}
