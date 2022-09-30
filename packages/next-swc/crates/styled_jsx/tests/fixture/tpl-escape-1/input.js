export default class {
  render() {
    return (
      <div>
        <p>test</p>
        <style jsx>{`
          p {
            content: '\`'
          }
        `}</style>
      </div>
    )
  }
}
