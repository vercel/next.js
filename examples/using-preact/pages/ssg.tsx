import type { GetStaticProps, InferGetStaticPropsType } from 'next'

export default function SSG({
  framework,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return <div>{framework} ssg example</div>
}

export const getStaticProps: GetStaticProps<{ framework: string }> = () => {
  return {
    props: { framework: 'preact' },
  }
}
