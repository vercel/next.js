import { InferGetStaticPropsType } from 'next'

export function getStaticProps() {
  return {
    props: { framework: 'preact' },
  }
}

export default function SSGPage({
  framework,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return <div>{framework} ssg example</div>
}
