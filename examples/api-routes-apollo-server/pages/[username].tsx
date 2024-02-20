import queryGraphql from "../shared/query-graphql";

export default function UserProfile({ user }) {
  if (!user) {
    return <h1>User Not Found</h1>;
  }
  return (
    <h1>
      {user.username} is {user.name}
    </h1>
  );
}

export async function getStaticProps(context) {
  const { params } = context;
  const { username } = params;
  const { user = null } = await queryGraphql(
    `
    query($username: String) {
      user(username: $username) {
        name
        username
      }
    }
  `,
    { username },
  );
  return { props: { user } };
}

export async function getStaticPaths() {
  const { users } = (await queryGraphql(`
    query {
      users {
        username
      }
    }
  `)) as { users: { username: string }[] };

  return {
    paths: users.map(({ username }) => ({
      params: { username },
    })),
    fallback: true,
  };
}
