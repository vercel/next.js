import { getGeneratorValue } from '../../../../generator-value'

export async function getStaticParams() {
  return [{ slug: await getGeneratorValue('page') }]
}
