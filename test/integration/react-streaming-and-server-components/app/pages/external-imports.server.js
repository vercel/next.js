import moment from 'moment'
import nonIsomorphicText from 'non-isomorphic-text'

export default function Page() {
  return (
    <div>
      <div>date:{moment().toString()}</div>
      <div>{nonIsomorphicText()}</div>
    </div>
  )
}
