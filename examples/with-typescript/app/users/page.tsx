// app/users/page.tsx

import Link from 'next/link';
import { sampleUserData } from '../../utils/sample-data';
import List from '../../components/List';
import Layout from '../../components/Layout';

export default function UsersListPage() {
  const items = sampleUserData;

  return (
    <Layout title="Users List | Next.js App Router">
      <h1>Users List</h1>
      <p>
        Example fetching data from inside a component using static params.
      </p>
      <p>You are currently on: /users</p>
      <List items={items} />
      <p>
        <Link href="/">Go home</Link>
      </p>
    </Layout>
  );
}
