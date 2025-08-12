export const getServerSideProps = ({ params }) => {
  return {
    props: {
      code: params.inviteCode,
    },
  }
}

export default ({ code }) => `hello from /teams/invite/[inviteCode] ${code}`
