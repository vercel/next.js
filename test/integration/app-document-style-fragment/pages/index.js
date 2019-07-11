function Hi () {
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

Hi.getInitialProps = () => ({})

export default Hi
