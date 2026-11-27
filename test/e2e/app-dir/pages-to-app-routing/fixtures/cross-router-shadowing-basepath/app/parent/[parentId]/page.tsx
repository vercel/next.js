type Props = {
  params: Promise<{ parentId: string }>
}

export default async function ParentPage({ params }: Props) {
  const { parentId } = await params

  return <h1 id="page-title">App Parent: {parentId}</h1>
}
