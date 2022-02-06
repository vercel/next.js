const color = 'red'
const otherColor = 'green'

const A = () => (
  <div>
    <p>test</p>
    <style jsx>{`p { color: ${color} }`}</style>
  </div>
)

const B = () => (
  <div>
    <p>test</p>
    <style jsx>{`p { color: ${otherColor} }`}</style>
  </div>
)

export default () => (
  <div>
    <A />
    <B />
  </div>
)
