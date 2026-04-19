import { parseISO, format } from "date-fns";

export default function HumanDate({ dateString }) {
  const date = parseISO(dateString);
  return <time dateTime={dateString}>{format(date, "MMM	d, yyyy")}</time>;
}
