// app/users/[id]/page.tsx

import { notFound } from 'next/navigation';
import { sampleUserData } from '../../../utils/sample-data';
import ListDetail from '../../../components/ListDetail';
import Layout from '../../../components/Layout';

type Props = {
  params: { id: string };
};

export async function generateStaticParams() {
  return sampleUserData.map((user) => ({
    id: user.id.toString(),
  }));
}

export default async function UserDetailPage({ params }: Props) {
  const id = Number(params.id);
  const item = sampleUserData.find((user) => user.id === id);

  if (!item) {
    notFound();
  }

  return (
    <Layout title={`${item.name} | Next.js App Router`}>
      <ListDetail item={item} />
    </Layout>
  );
}
