import { print } from "graphql/language/printer";

// route handler with secret and slug
import { ContentNode, LoginPayload } from "@/gql/graphql";
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import gql from "graphql-tag";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Parse query string parameters
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const id = searchParams.get("id");

  // Check the secret and next parameters
  // This secret should only be known to this route handler and the CMS
  if (secret !== process.env.HEADLESS_SECRET || !id) {
    return new Response("Invalid token", { status: 401 });
  }

  const mutation = gql`
  mutation LoginUser {
    login( input: {
      clientMutationId: "uniqueId",
      username: "${process.env.WP_USER}",
      password: "${process.env.WP_APP_PASS}"
    } ) {
      authToken
      user {
        id
        name
      }
    }
  }
`;

  const { login } = await fetchGraphQL<{ login: LoginPayload }>(
    print(mutation),
  );

  const authToken = login.authToken;

  // Enable Draft Mode by setting the cookie
  draftMode().enable();

  // Fetch the headless CMS to check if the provided `id` exists
  // getPostBySlug would implement the required fetching logic to the headless CMS
  const query = gql`
    query GetContentNode($id: ID!) {
      contentNode(id: $id, idType: DATABASE_ID) {
        uri
        status
        databaseId
      }
    }
  `;

  const { contentNode } = await fetchGraphQL<{ contentNode: ContentNode }>(
    print(query),
    {
      id,
    },
    { Authorization: `Bearer ${authToken}` },
  );

  // If the id doesn't exist prevent draft mode from being enabled
  if (!contentNode) {
    return new Response("Invalid id", { status: 401 });
  }

  // Redirect to the path from the fetched post
  // We don't redirect to searchParams.slug as that might lead to open redirect vulnerabilities
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}${
      contentNode.status === "draft"
        ? `/preview/${contentNode.databaseId}`
        : contentNode.uri
    }`,
  );

  response.headers.set("Set-Cookie", `wp_jwt=${authToken}; path=/;`);

  return response;
}
