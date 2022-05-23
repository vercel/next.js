export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
      p {
        color: red;
      }
      
      p{
        color: red
      }
      
      * {
        color: blue;
      }
      
      [href="woot"] {
        color: red;
      }
    `}</style>
  </div>
)