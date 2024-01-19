export default function Layout({ children, slot0, slot1, slot2 }) {
  return (
    <>
      Children: <div id="nested-children">{children}</div>
      Slot: <div id="slot">{slot0}</div>
      Slot: <div id="slot">{slot1}</div>
      Slot: <div id="slot">{slot2}</div>
    </>
  )
}
