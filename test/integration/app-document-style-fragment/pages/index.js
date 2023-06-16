function Hi() {
  return (
    <div>
      <p>Hello world!</p>
      <style jsx>{`
        p {
          font-size: 16.4px;
        }
      `}</style>
    </div>
  )
}

Hi.getInitialProps = () => ({
  // To prevent the warning related to an empty object from getInitialProps, we
  // need to return something.
  foo: 'bar',
})

export default Hi
