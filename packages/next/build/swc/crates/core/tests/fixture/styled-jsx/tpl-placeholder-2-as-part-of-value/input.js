export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx>{`
            :global(.a):hover .b {
              a: ${a[b]}px !important;
              b: translate3d(
                  0,
                  ${-1 * (c || 0)}px,
                  -${d}px
                )
                scale(1) !important;
            }
          `}</style>
        </div>
      )
    }
  }
  