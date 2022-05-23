import { parse } from 'url'

export default function Pid({ text, pathname }) {
  return (
    <>
      <div>{`query: ${text}`}</div>
      <div>{`pathname: ${pathname}`}</div>
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
