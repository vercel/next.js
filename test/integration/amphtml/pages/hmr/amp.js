export const config = { amp: true }

export default () => (
  <>
    <p>I'm an AMP page!</p>
    <span>{new Date().getTime()}</span>
  </>
)
