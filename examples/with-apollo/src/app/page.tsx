import { ApolloClientProvider, RepoList } from "@/client-components";

export default async function Home() {
  return (
    <ApolloClientProvider>
      <RepoList />
    </ApolloClientProvider>
  );
}
