import { getAllEntries } from "@/lib/fauna";
import GuestbookPage from "./guestbook-page";

export type EntryType = {
  id: string;
  name: string;
  message: string;
  createdAt: {
    isoString: string;
  };
};

export default async function Page() {
  const entries = (await getAllEntries()) as EntryType[];
  return <GuestbookPage entries={entries} />;
}
