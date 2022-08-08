import styles from './styles'

const styles2 = require('./styles2')

// external only
export const Test1 = () => (
  <div>
    <p>external only</p>
    <style jsx>{styles}</style>
    <style jsx>{styles2}</style>
  </div>
)

// external and static
export const Test2 = () => (
  <div>
    <p>external and static</p>
    <style jsx>{`
      p {
        color: red;
      }
    `}</style>
    <style jsx>{styles}</style>
  </div>
)

// external and dynamic
export const Test3 = ({ color }) => (
  <div>
    <p>external and dynamic</p>
    <style jsx>{`
      p {
        color: ${color};
      }
    `}</style>
    <style jsx>{styles}</style>
  </div>
)

// external, static and dynamic
export const Test4 = ({ color }) => (
  <div>
    <p>external, static and dynamic</p>
    <style jsx>{`
      p {
        display: inline-block;
      }
    `}</style>
    <style jsx>{`
      p {
        color: ${color};
      }
    `}</style>
    <style jsx>{styles}</style>
  </div>
)

// static only
export const Test5 = () => (
  <div>
    <p>static only</p>
    <style jsx>{`
      p {
        display: inline-block;
      }
    `}</style>
    <style jsx>{`
      p {
        color: red;
      }
    `}</style>
  </div>
)

// static and dynamic
export const Test6 = ({ color }) => (
  <div>
    <p>static and dynamic</p>
    <style jsx>{`
      p {
        display: inline-block;
      }
    `}</style>
    <style jsx>{`
      p {
        color: ${color};
      }
    `}</style>
  </div>
)

// dynamic only
export const Test7 = ({ color }) => (
  <div>
    <p>dynamic only</p>
    <style jsx>{`
      p {
        color: ${color};
      }
    `}</style>
  </div>
)

// dynamic with scoped compound variable
export const Test8 = ({ color }) => {
  if (color) {
    const innerProps = { color }

    return (
      <div>
        <p>dynamic with scoped compound variable</p>
        <style jsx>{`
          p {
            color: ${innerProps.color};
          }
        `}</style>
      </div>
    )
  }
}

// dynamic with compound variable
export const Test9 = ({ color }) => {
  const innerProps = { color }

  return (
    <div>
      <p>dynamic with compound variable</p>
      <style jsx>{`
        p {
          color: ${innerProps.color};
        }
      `}</style>
    </div>
  )
}

const foo = 'red'

// dynamic with constant variable
export const Test10 = () => (
  <div>
    <p>dynamic with constant variable</p>
    <style jsx>{`
      p {
        color: ${foo};
      }
    `}</style>
  </div>
)

// dynamic with complex scope
export const Test11 = ({ color }) => {
  const items = Array.from({ length: 5 }).map((item, i) => (
    <li className="item" key={i}>
      <style jsx>{`
        .item {
          color: ${color};
        }
      `}</style>
      Item #{i + 1}
    </li>
  ))

  return <ul className="items">{items}</ul>
}
