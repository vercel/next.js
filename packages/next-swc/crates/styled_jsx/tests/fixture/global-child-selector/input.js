const Test = () => (
  <div>
    <span>test</span>
    <style jsx>{`
      div > :global(span) {
        color: red;
      }
    `}</style>
  </div>
)