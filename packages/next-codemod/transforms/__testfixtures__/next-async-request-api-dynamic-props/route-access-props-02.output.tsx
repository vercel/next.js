export async function GET(req, props: any) {
  const params = await props.params;
  call(params.foo)
}

export async function DELETE(req, props: any) {
  const params = await props.params;
  call(params.foo)
}

export async function PATCH(req, context: any) {
  call((await context.params).foo)
}