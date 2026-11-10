// The two generated LayoutProps implementations currently disagree on whether
// a default-only parallel route contributes a required prop.
export default function Layout(props: any) {
  // This layout has no ordinary children route. Expose an injected prop through
  // rendered output so the test can assert the public layout contract.
  const unexpectedChildren =
    'children' in props ? (
      <div id="unexpected-children-slot">{props.children}</div>
    ) : null

  return (
    <div>
      {unexpectedChildren}
      <div>{props.sidebar}</div>
      <div>{props.panel}</div>
    </div>
  )
}
