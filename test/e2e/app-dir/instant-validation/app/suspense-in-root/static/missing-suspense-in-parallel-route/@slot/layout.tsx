export const unstable_instant = true
export default function SlotLayout({ children }) {
  return (
    <div>
      <em>This is a layout inside the slot</em>
      <hr />
      {children}
    </div>
  )
}
