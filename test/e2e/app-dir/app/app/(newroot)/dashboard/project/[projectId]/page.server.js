export function getStaticProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [
      {
        params: { projectId: 'project-1' },
      },
      {
        params: { projectId: 'project-2' },
      },
    ],
    fallback: 'blocking',
  }
}

export default function Page(props) {
  return (
    <>
      <p>/dashboard/project/[projectId]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
