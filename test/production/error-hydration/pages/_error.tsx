export default function ErrorPage() {
  return <div>Error Page Content</div>
}

ErrorPage.getInitialProps = async () => {
  if (typeof window !== 'undefined') {
    ;(window as any).__ERROR_PAGE_GET_INITIAL_PROPS_INVOKED_CLIENT_SIDE__ = true
  }

  return {}
}
