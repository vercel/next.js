export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx>{`
            @media only screen {
                a {
                    ${inputSize ? 'height: calc(2 * var(--a)) !important;' : ''}
                }
            }
          `}</style>
        </div>
      )
    }
  }
  