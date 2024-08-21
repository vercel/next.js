export function formatVariant(
  scenario: string,
  props: Record<string, string | number | boolean | null>
): string {
  const keys = Object.keys(props)
    .filter((key) => props[key] !== false && props[key] !== null)
    .map((key) => (props[key] === true ? key : `${key}=${props[key]}`));
  if (keys.length === 0) {
    return scenario;
  }
  return `${scenario} ${keys.join(" ")}`;
}
