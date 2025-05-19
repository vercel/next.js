import { redirect } from "next/navigation";
import PageImplementation from "./PageImplementation";
import { isAuthenticatedAction } from "./actions";

export default async function ProtectedLayout({ searchParams }) {
  const searchParams_ = await searchParams;
  console.log("searchParams_", searchParams_);
  const isAuthenticated = await isAuthenticatedAction(searchParams_);

  // const { accessToken, refreshToken, user } = context;
  // return nhost.auth.isAuthenticated()
  //   ? {
  //       accessToken: accessToken.value!,
  //       accessTokenExpiresIn: (accessToken.expiresAt!.getTime() - Date.now()) / 1_000,
  //       refreshToken: refreshToken.value!,
  //       user: user!
  //     }
  //   : null

  if (!isAuthenticated) {
    return redirect("/login"); // Or your login page path
  }

  // If authenticated, render the children (the actual page)
  // The NhostProvider for client components will still be handled by your root App.js
  return <PageImplementation />;
}
