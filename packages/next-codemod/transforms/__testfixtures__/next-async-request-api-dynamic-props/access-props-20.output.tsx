export default async function Page(props: {
  params: Promise<{
    teamSlug: string;
    project: string;
  }>
}): JSX.Element {
  return <div {...(await props.params)} />;
}
