export function timeString(lastUpdate) {
  const pad = (n) => (n < 10 ? `0${n}` : n);
  const format = (t) =>
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(
      t.getUTCSeconds()
    )}`;
  return format(new Date(lastUpdate));
}
