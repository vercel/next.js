export default function Layout({ children, slot0, slot1 }) {
  return (
    <>
      Children: <div id="nested-children">{children}</div>
      Slot0: <div id="slot0">{slot0}</div>
      Slot1: <div id="slot1">{slot1}</div>
    </>
  )
}
