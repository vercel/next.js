export default async function Page(props: {
  params: {
    teamSlug: string;
    project: string;
  }
}): JSX.Element {
  return <div {...props.params} />
}
