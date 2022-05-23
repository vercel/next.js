export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx>{`
            .item {
              max-width: ${a ? '100%' : '200px'};
              padding: ${b ? '0' : '8px 20px'};
            }
          `}</style>
        </div>
      )
    }
  }
  