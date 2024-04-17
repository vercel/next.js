import cn from "classnames";
import formatDate from "date-fns/format";
import EntryForm from "@/components/EntryForm";
import { EntryType } from "./page";

const EntryItem = ({ entry }: { entry: EntryType }) => (
  <div className="flex flex-col space-y-2">
    <div className="prose dark:prose-dark w-full">{entry.message}</div>
    <div className="flex items-center space-x-3">
      <p className="text-sm text-gray-500">{entry.name}</p>
      <span className="text-gray-200 dark:text-gray-800">/</span>
      <p className="text-sm text-gray-400 dark:text-gray-600">
        {formatDate(
          new Date(entry.createdAt.isoString),
          "d MMM yyyy 'at' h:mm bb",
        )}
      </p>
    </div>
  </div>
);

export default async function GuestbookPage({
  entries,
}: {
  entries: EntryType[];
}) {
  return (
    <main className="max-w-4xl mx-auto p-4">
      <div
        className={cn(
          "border border-blue-200 rounded p-6",
          "my-4 w-full dark:border-gray-800 bg-blue-50",
          "dark:bg-blue-opaque",
        )}
      >
        <h5 className={cn("text-lg md:text-xl font-bold", "text-gray-900")}>
          Sign the Guestbook
        </h5>
        <p className="my-1 text-gray-800">
          Share a message for a future visitor.
        </p>
        <EntryForm />
      </div>

      <div className="mt-4 space-y-8 px-2">
        {entries?.map((entry) => (
          <EntryItem key={entry.id} entry={entry} />
        ))}
      </div>
    </main>
  );
}
