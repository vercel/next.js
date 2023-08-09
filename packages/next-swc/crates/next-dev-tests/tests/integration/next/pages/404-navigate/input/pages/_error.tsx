import { useTestHarness } from '@turbo/pack-test-harness'

export default function ErrorPage(props: { static: 'static' }) {
  useTestHarness((harness) => harness.markAsHydrated())

  return <div data-test-error>{props.static}</div>
}

export function getStaticProps() {
  return {
    props: {
      static: 'static',
    },
  }
}
