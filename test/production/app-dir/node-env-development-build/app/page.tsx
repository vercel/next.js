export default function Page() {
  if (process.env.TEST_PRERENDER_FAILURE === 'true') {
    throw new Error('intentional prerender failure')
  }

  return <p>hello world</p>
}
