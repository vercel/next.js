// x-ref: https://github.com/vercel/next.js/issues/71840

import { ElementType } from 'react'

async function getImport(
  slug: string,
  exportName: string
): Promise<ElementType> {
  const moduleExports = await import(`./${slug}`)
  return moduleExports[exportName]
}

export default async function Home() {
  const Button = await getImport('button', 'Button')
  return <Button />
}
