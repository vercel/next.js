interface Props {
  params: Promise<{
    slug: string;
  }>
}

export function generateMetadata(props: Props, parent: any) {
  console.log({ ...parent })
}

export default async function Page(props: Props) {
  const config = { /* @next-codemod-error 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
  ...props }
  return (
    (<Child /* @next-codemod-error 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
    {...props} {...config} />)
  );
}

export function GET(req, ctx) {
  console.log(
    { /* @next-codemod-error 'ctx' is used with spread syntax (...). Any asynchronous properties of 'ctx' must be awaited when accessed. */
    ...ctx }
  )
}

export function POST(req, ctx) {
  console.log(
    { ...req }
  )
}

export function PATCH(req, ctx) {
  console.log(
    { /* @next-codemod-ignore */ ...ctx }
  )
}

export function PUT(req, ctx) {
  console.log(
    {
      // @next-codemod-ignore
      ...ctx
    }
  )
}

export function OPTIONS(req, ctx) {
  console.log(
    {
      /* @next-codemod-error 'ctx' is used with spread syntax (...). Any asynchronous properties of 'ctx' must be awaited when accessed. */
      // @next-codemod-incorrect-ignore
      ...ctx
    }
  )
}
