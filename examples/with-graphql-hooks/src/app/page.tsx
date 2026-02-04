import { ClientContextProvider, RepoList } from "@/client-components";

export default async function Home() {
  return (
    <ClientContextProvider>
      <RepoList />
    </ClientContextProvider>
  );
}
