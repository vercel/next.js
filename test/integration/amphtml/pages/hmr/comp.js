import Hello from '../../components/hello'

export const config = { amp: true }

export default () => (
  <>
    <Hello />
    <span>{new Date().getTime()}</span>
  </>
)
