import { dir } from 'keyv'

const contains = require('keyv/string/#/contains')

export default function Predefined() {
  return (
    <>
      <div id="directory">{dir}</div>
      <div id="contains-directory">{contains.dir}</div>
      <div id="contains">
        {JSON.stringify([
          typeof contains,
          contains.call('hello', 'ell'),
          contains.call('hello', 'no'),
        ])}
      </div>
    </>
  )
}
