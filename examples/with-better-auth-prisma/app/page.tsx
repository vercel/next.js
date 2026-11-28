import { getSession, signOut } from "@/lib/user-auth";
import { redirect } from "next/navigation";

const Homepage = async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div className="w-dvw min-h-dvh flex items-center justify-center bg-black font-sans p-4">
      <div className="border border-neutral-800 rounded-lg shadow-sm p-8 min-w-[320px] max-w-sm w-full bg-neutral-950 flex flex-col gap-6 items-center">
        <h1 className="text-xl font-semibold text-neutral-100 mb-2 text-center">
          You have successfully logged in as:
        </h1>
        <div className="flex flex-col gap-1 items-center">
          <p className="text-neutral-300 font-medium">{session.user.name}</p>
          <p className="text-neutral-500 text-sm">{session.user.email}</p>
        </div>
        <form action={signOut} className="mt-4 w-full flex justify-center">
          <button
            type="submit"
            className="bg-neutral-100 text-neutral-900 rounded px-4 py-2 hover:bg-neutral-200 transition text-sm font-medium w-full"
          >
            Logout
          </button>
        </form>
      </div>
    </div>
  );
};

export default Homepage;
