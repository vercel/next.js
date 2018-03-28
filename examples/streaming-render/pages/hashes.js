import _ from 'lodash'
import md5 from 'md5'

let arrayOfLength = len => {
  return Array.apply(null, Array(len)).map(function () {})
}

function MakeHash (props) {
  const hash = md5(props.idx)
  return <div>{hash.substr(0, 30)}</div>
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
