// A third-party script (consent managers, chat widgets, some extensions)
// that prepends its own <div> to <body> before React has hydrated. React
// hydrates <body> children by tag name, so whatever Next renders as the
// first child of <body> must not be a <div>, or that foreign node is claimed
// for it, hydration fails, and the whole document is regenerated on the
// client — which deletes the third party's DOM.
const PREPEND_A_DIV = `
  var el = document.createElement('div');
  el.id = 'third-party';
  el.textContent = 'third party';
  document.body.insertBefore(el, document.body.firstChild);
`

export default function Page() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PREPEND_A_DIV }} />
      <p id="content">third-party prepend page</p>
    </>
  )
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return {
    title: 'third-party prepend page',
  }
}

export const dynamic = 'force-dynamic'
