import { parseISO, format } from "date-fns";

type DateFormatterProps = { dateString: string | null };

export default function DateFormatter({ dateString }: DateFormatterProps) {
  if (dateString === null) {
    return <></>;
  }

  const date = parseISO(dateString);
  return <time dateTime={dateString}>{format(date, "LLLL	d, yyyy")}</time>;
}
