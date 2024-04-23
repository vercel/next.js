import formatDistanceToNowStrict from "date-fns/formatDistanceToNowStrict";

export default function distanceToNow(dateTime: number | Date) {
  return formatDistanceToNowStrict(dateTime, {
    addSuffix: true,
  });
}
