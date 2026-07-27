// not exported as default, so is not following convention of page.tsx file
// which would throw at type check if was not _private
export function PrivatePage() {
  return <h1>hello world</h1>
}
