// Not a valid alternate, but `markdown` exports aren't inspected while
// `experimental.acceptMarkdown` is off.
export const markdown = 123 as any

export default function Page() {
  return <p>invalid export ignored</p>
}
