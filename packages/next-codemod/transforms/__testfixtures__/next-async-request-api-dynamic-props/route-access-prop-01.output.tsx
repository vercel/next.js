// Fake route handlers should not be transformed
export const GET = function ({ params }: any) {
  call(params.foo)
}

export function POST({ params }: any) {
  call(params.foo)
}

export async function DELETE({ params }: any) {
  call(params.foo)
}
