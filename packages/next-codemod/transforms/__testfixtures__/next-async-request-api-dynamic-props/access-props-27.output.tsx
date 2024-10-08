interface Props {
  params: Promise<{
    slug: string;
  }>
}

export default async function Page(props: Props) {
  const config = { /* Next.js Dynamic Async API Codemod: 'props' is spread as props. Any asynchronous properties of 'props' must be awaited when accessed. */
  ...props }
  return (
    (<Child /* Next.js Dynamic Async API Codemod: 'props' is spread as props. Any asynchronous properties of 'props' must be awaited when accessed. */
    {...props} {...config} />)
  );
}
