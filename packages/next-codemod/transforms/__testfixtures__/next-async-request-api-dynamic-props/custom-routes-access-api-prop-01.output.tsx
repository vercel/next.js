// TODO: handle variable declaration
// export const GET = function ({ params }: any) {
//   call(params.foo)
// }

export async function POST(props: any) {
  const params = await props.params;
  call(params.foo)
}

export async function DELETE(props: any) {
  const params = await props.params;
  call(params.foo)
}
