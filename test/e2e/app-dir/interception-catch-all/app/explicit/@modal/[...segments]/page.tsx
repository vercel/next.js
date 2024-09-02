// This component is required for the cart modal to hide when the user navigates to a new page
// https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#closing-the-modal
// Since client-side navigations to a route that no longer match the slot will remain visible,
// we need to match the slot to a route that returns null to close the modal.
export default function CatchAll() {
  return 'modal catch-all'
}
