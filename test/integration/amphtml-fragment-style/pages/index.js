export const config = { amp: true }

const Comp = () => (
  <div>
    <p>Hello world!</p>
    <style jsx>{`
      p {
        font-size: 16.4px;
      }
    `}</style>
  </div>
)

Comp.getInitialProps = () => ({})
export default Comp
