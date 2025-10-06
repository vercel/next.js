export function GET(req, { params }: any) {
  call(params.foo)
}

export async function DELETE(req, { params }: any) {
  call(params.foo)
}

export async function PATCH(req, context: any) {
  call(context.params.foo)
}