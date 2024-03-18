export default function Layout({ children, slot }) {
  return (
    <>
      Children: <div id="nested-children">{children}</div>
      Slot: <div id="slot">{slot}</div>
    </>
  )
}
