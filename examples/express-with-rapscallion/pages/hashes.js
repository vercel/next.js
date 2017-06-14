import _ from 'lodash'
import md5 from 'md5'

let arrayOfLength = (len) => {
  return Array.apply(null, Array(len)).map(function () {})
}

function MakeHash (props) {
  const hash = md5(props.idx)
  return (
    <div>
      {hash.substr(0, 15)}
    </div>
  )
}

function Hashes (props) {
  return <div cacheKey={`MD5List:length-${props.hashCount}`}>
    {_.map(arrayOfLength(props.hashCount), (object, idx) => {
      return <MakeHash idx={idx} key={`MD5:${idx}`} cacheKey={`MD5:${idx}`} />
    })}
  </div>
}

export default() => <Hashes hashCount={3000} />
