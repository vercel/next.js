import { usingEvalSync, usingEval } from '../lib/utils'

export async function getServerSideProps() {
  return {
    props: await usingEval(),
  }
}

export default function Page(props) {
  return (
    <div>
      {props.value} and {usingEvalSync().value}
    </div>
  )
}
