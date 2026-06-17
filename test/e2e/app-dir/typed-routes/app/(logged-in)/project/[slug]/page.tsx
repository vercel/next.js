export default async function Page(props: PageProps<'/project/[slug]'>) {
  const { slug } = await props.params
  return <p>project {slug}</p>
}

export const generateMetadata = async ({
  params,
}: PageProps<'/project/[slug]'>) => {
  const { slug } = await params
  return {
    title: `Project ${slug}`,
  }
}
