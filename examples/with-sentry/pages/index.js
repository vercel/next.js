import { useEffect, useState } from 'react'
import Link from 'next/link'

const Index = () => {
  const [state, setState] = useState({
    raiseErrorInUseEffectHook: null,
  })

  useEffect(() => {
    if (state.raiseErrorInUseEffectHook) {
      throw new Error('Error in useEffect Hook')
    }
  }, [state.raiseErrorInUseEffectHook])

  return (
    <div>
      <h2>Index page</h2>
      <ul>
        <li>
          <a
            href="#"
            onClick={() =>
              setState((current) => ({
                ...current,
                raiseErrorInUseEffectHook: '1',
              }))
            }
          >
            Raise the error in render or update
          </a>
        </li>
        <li>
          <Link href={{ pathname: '/', query: { raiseError: '1' } }}>
            <a>Raise error in getServerSideProps</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}

export async function getServerSideProps({ query }) {
  if (query.raiseError) {
    throw new Error('Error in getServerSideProps')
  }

  return {
    props: {},
  }
}

export default Index
