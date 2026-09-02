if (typeof window !== 'undefined') {
  throw new Error('Test Pages module runtime error')
}

export default function PagesModuleRuntimeErrorPage() {
  return <p id="pages-module-page-content">Server render</p>
}
