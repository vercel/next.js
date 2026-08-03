// Deliberately does not import the action, so an action POST that lands here
// goes through `createForwardedActionResponse`.
export default function Page() {
  return <main id="without-action-page">without-action</main>
}
