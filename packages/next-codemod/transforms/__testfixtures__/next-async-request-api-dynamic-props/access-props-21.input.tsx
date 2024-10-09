/* this is a comment */
'use client'
export default function Page(props: {
  params: any
}): JSX.Element {
  return <div {...props.params} />
}
