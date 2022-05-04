export async function getServerSideProps({ params }) {
  if (params.slug === 'nonexistent') {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      isUser: params.slug === 'tim',
      isBoth: params.slug === 'both',
    },
  }
}

export default function UserOrTeam({ isUser, isBoth, user, team }) {
  return (
    <>
      {isUser && !isBoth ? user : team}
      {isBoth ? (
        <>
          {user}
          {team}
        </>
      ) : null}
    </>
  )
}
