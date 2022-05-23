export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
      html {
        background-image:
          linear-gradient(0deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.8)),
          url(/static/background.svg);
      }
      
      :global(p) {
        color: blue
      }
      
      :global(p){
        color: blue;
      }
      
      :global(p), a {
        color: blue;
      }
      
      :global(.foo + a) {
        color: red;
      }
      
      :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      }
    `}</style>
  </div>
)