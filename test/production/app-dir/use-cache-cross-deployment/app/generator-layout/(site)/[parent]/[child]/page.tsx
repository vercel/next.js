import { getGeneratorValue } from '../../../../generator-value'

export const unstable_paramMatching = {
  parent: 'not-found',
  child: 'not-found',
} as const

export async function generateStaticParams({
  params,
}: {
  params: { parent: string }
}) {
  return [{ child: await getGeneratorValue(`child:${params.parent}`) }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ parent: string; child: string }>
}) {
  const { parent, child } = await params
  return <p>{`${parent}/${child}`}</p>
}
