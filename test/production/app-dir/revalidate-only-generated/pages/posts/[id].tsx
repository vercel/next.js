import fs from 'fs'
import path from 'path'
import type { GetStaticPaths, GetStaticProps } from 'next'

export const getStaticPaths: GetStaticPaths = () => ({
  paths: [{ params: { id: '1' } }],
  fallback: 'blocking',
})

// The build generates the post. The test removes it afterwards by creating
// this file.
export const getStaticProps: GetStaticProps<{ id: string }> = ({ params }) => {
  if (fs.existsSync(path.join(process.cwd(), 'post-removed.txt'))) {
    return { notFound: true }
  }

  return { props: { id: params!.id as string } }
}

export default function Post({ id }: { id: string }) {
  return <p id="post">post {id}</p>
}
