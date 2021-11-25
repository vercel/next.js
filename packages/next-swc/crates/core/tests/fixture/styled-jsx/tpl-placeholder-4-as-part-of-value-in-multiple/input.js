export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx>{`
            :global(.a):hover .b {
              display: inline-block;
              padding: 0 ${a || 'var(--c)'};
              color: ${b || 'inherit'};
            }
          `}</style>
        </div>
      )
    }
  }
  