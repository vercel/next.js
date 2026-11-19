export function hasVoidfullVariables() {
  return !!(
    process.env.NEXT_PUBLIC_VOIDFULL_SITE_ID &&
    process.env.NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN
  );
}
