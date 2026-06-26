import NotRoutableComponent from './not/routable/component'

export default function FooterSlot() {
  return (
    <div>
      <h3>Catch-All Footer Slot</h3>
      <p>This is the @footer parallel route in a catch-all segment</p>
      <NotRoutableComponent />
    </div>
  )
}
