const Page =
  typeof window === 'undefined'
    ? function Page() {
        return <p id="invalid-default-server-render">Server render</p>
      }
    : 42

export default Page
