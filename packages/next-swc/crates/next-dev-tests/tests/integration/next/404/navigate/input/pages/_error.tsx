import { useEffect } from 'react'

export default function ErrorPage(props: { static: 'static' }) {
  useEffect(() => {
    import('@turbo/pack-test-harness').then((harness) =>
      harness.markAsHydrated()
    )
  })

  return <div data-test-error>{props.static}</div>
}

export function getStaticProps() {
  return {
    props: {
      static: 'static',
    },
  }
}
