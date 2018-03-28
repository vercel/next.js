import _ from 'lodash'
import md5 from 'md5'
import styled from 'styled-components'

let arrayOfLength = len => {
  return Array.apply(null, Array(len)).map(function () {})
}

const StyledHash = styled.div`
  color: #${props => props.hash.substr(0, 6)};
`

function MakeHash (props) {
  const hash = md5(props.idx)
  return <StyledHash hash={hash}>{hash.substr(0, 30)}</StyledHash>
}

function Hashes (props) {
  return (
    <div>
      {_.map(arrayOfLength(props.hashCount), (object, idx) => {
        return <MakeHash idx={`${idx}-${props.path}`} key={`MD5:${idx}`} />
      })}
    </div>
  )
}

export default ({ url: { asPath } }) => {
  return <Hashes hashCount={2000} path={asPath} />
}
