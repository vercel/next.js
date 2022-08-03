// CSS modules can only be imported inside client components for now.
import RedText from '../../components/red/index.client'

export default function CSSM() {
  return (
    <RedText id="red-text">
      <h1>This should be in red</h1>
    </RedText>
  )
}
