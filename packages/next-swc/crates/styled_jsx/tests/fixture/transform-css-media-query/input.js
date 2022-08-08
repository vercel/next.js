export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
      @media (min-width: 1px) and (max-width: 768px) {
        [class*='grid__col--'] {
          margin-top: 12px;
          margin-bottom: 12px;
        }
      }
      
      @media (max-width: 64em) {
        .test {
          margin-bottom: 1em;
        }
        @supports (-moz-appearance: none) and (display: contents) {
          .test {
            margin-bottom: 2rem;
          }
        }
      }      
    `}</style>
  </div>
)