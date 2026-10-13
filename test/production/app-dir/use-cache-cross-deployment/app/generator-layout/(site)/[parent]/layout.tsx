import { getGeneratorValue } from '../../../generator-value'

export async function generateStaticParams() {
  return [{ parent: await getGeneratorValue('layout') }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
