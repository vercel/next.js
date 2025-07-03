interface UserPageProps {
  user: {
    id: string
    name: string
    email: string
  }
}

export default function UserPage({ user }: UserPageProps) {
  return (
    <div>
      <h1>User Profile</h1>
      <p>ID: {user.id}</p>
      <p>Name: {user.name}</p>
      <p>Email: {user.email}</p>
    </div>
  )
}

export const getServerSideProps = async (context: any) => {
  const { id } = context.params!

  return {
    props: {
      user: {
        id: id as string,
        name: `User ${id}`,
        email: `user${id}@example.com`,
      },
    },
  }
}
