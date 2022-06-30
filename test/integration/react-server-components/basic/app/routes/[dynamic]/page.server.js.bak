import { parse } from 'url'
import RouterPath from '../../../components/router-path.client'

export default function Pid({ text, pathname }) {
  return (
    <>
      <div>{`query: ${text}`}</div>
      <div>{`pathname: ${pathname}`}</div>
      <RouterPath />
    </>
  )
}

export function getServerSideProps({ params, req }) {
  return {
    props: {
      pathname: parse(req.url).pathname,
      text: params.dynamic,
    },
  }
}
