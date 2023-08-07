import { A } from './a'
import { P } from './p'

export const FootNotes = ({ children }) => (
  <div className="text-base before:w-[200px] before:m-auto before:content[''] before:border-t before:border-gray-300 dark:before:border-[#444] before:block before:my-10">
    {children}
  </div>
)

export const Ref = ({ id }) => (
  <a
    href={`#f${id}`}
    id={`s${id}`}
    className="relative text-xs top-[-5px] no-underline"
  >
    [{id}]
  </a>
)

export const FootNote = ({ id, children }) => (
  <P>
    {id}.{' '}
    <A href={`#s${id}`} id={`f${id}`} className="no-underline">
      ^
    </A>{' '}
    {children}
  </P>
)
