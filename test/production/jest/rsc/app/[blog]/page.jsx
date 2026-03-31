export async function generateMetadata({ params: { blog: title } }) {
  return { title, description: 'A blog post about ' + title }
}

export default function Page({ params }) {
  return <h1>All about {params.blog}</h1>
}
