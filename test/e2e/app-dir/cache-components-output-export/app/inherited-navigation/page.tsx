async function value() {
  'use cache'
  return 'Inherited navigation assertion'
}

export default async function Page() {
  return <p id="assertion">{await value()}</p>
}
