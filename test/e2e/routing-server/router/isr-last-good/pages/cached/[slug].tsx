import type { GetStaticProps, GetStaticPaths } from 'next'

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: 'blocking',
})

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = String(params!.slug)
  const response = await fetch(
    `${process.env.ROUTING_ISR_ORIGIN}/value/${slug}`
  )
  if (!response.ok)
    throw new Error('intentional routing ISR regeneration failure')
  const { value } = await response.json()
  return {
    props: { value },
    revalidate: slug.startsWith('on-demand-') ? false : 1,
  }
}

export default function CachedPage({ value }: { value: string }) {
  return <p id="value">{value}</p>
}
