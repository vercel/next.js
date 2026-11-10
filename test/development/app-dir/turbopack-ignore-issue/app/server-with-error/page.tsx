if (Math.random() < 0) {
  require('a-missing-module-for-server-error-testing')
}

export default function Page() {
  return <p>server error page</p>
}
