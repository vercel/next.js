import { Hello } from '@mycomponent'

// prevent static generation
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function SingleAlias() {
  return (
    <div>
      <Hello />
    </div>
  )
}
