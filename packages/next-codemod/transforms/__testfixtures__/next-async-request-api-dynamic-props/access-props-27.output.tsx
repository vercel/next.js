interface Props {
  params: Promise<{
    slug: string;
  }>
}

export function generateMetadata(props: Props, parent: any) {
  console.log({ ...parent })
}

export default async function Page(props: Props) {
  const config = { /* Next.js Dynamic Async API Codemod: 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
  ...props }
  return (
    (<Child /* Next.js Dynamic Async API Codemod: 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
    {...props} {...config} />)
  );
}

export function GET(req, ctx) {
  console.log(
    { /* Next.js Dynamic Async API Codemod: 'ctx' is used with spread syntax (...). Any asynchronous properties of 'ctx' must be awaited when accessed. */
    ...ctx }
  )
}

export function POST(req, ctx) {
  console.log(
    { ...req }
  )
}
