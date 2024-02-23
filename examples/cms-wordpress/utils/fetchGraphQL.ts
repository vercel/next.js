import { draftMode, cookies } from "next/headers";

export async function fetchGraphQL<T = any>(
  query: string,
  variables?: { [key: string]: any },
  headers?: { [key: string]: string },
): Promise<T> {
  const { isEnabled: preview } = draftMode();

  try {
    // Handle authentication for draft mode
    let authHeader = "";
    if (preview) {
      const auth = cookies().get("wp_jwt")?.value;
      if (auth) {
        authHeader = `Bearer ${auth}`;
      }
    }

    const body = JSON.stringify({
      query,
      variables: {
        preview,
        ...variables,
      },
    });

    // Fetch data from external GraphQL endpoint.
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_WORDPRESS_API_URL}/graphql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader && { Authorization: authHeader }),
          ...headers,
        },
        body,
        cache: preview ? "no-cache" : "default",
        next: {
          tags: ["wordpress"],
        },
      },
    );

    // If the response status is not 200, throw an error.
    if (!response.ok) {
      console.error("Response Status:", response);
      throw new Error(response.statusText);
    }

    // Read the response as JSON.
    const data = await response.json();

    // Throw an error if there was a GraphQL error.
    if (data.errors) {
      console.error("GraphQL Errors:", data.errors);
      throw new Error("Error executing GraphQL query");
    }

    // Finally, return the data.
    return data.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
