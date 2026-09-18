export default function Page() {
  return <p>webpack {process.env.ACTIVE_WEBPACK_VERSION ?? 'bundled'}</p>
}
