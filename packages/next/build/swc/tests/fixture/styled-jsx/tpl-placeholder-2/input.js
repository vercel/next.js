export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx>{`
            @media only screen {
                a {
                    foo: ${input}%;
                    bar: baz;
                }
            }
          `}</style>
        </div>
      )
    }
  }
  