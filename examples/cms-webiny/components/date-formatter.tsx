import { parseISO, format } from "date-fns";

export default function DateFormatter({ dateString }) {
  if (!dateString) {
    return null;
  }
  const date = parseISO(dateString);
  const formattedDate = format(date, "LLLL	d, yyyy");
  return <time dateTime={dateString}>{formattedDate}</time>;
}
