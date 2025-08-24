import { GraphQLClient, ClientContext } from "graphql-hooks";

export const client = new GraphQLClient({
  url: "https://main--spacex-l4uc6p.apollographos.net/graphql",
});

export function ClientContextProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}
