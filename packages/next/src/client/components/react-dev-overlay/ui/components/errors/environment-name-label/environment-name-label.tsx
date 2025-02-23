export function EnvironmentNameLabel({
  environmentName,
}: {
  environmentName: string
}) {
  return <span data-nextjs-environment-name-label>{environmentName}</span>
}

export const ENVIRONMENT_NAME_LABEL_STYLES = `
  [data-nextjs-environment-name-label] {
    padding: 2px 6px;
    margin: 0;
    /* used --size instead of --rounded because --rounded is missing 6px */
    border-radius: var(--rounded-md-2);
    background: var(--color-gray-300);
    font-weight: 600;
    font-size: var(--size-font-11);
    color: var(--color-gray-900);
    font-family: var(--font-stack-monospace);
    line-height: 1.25em; /* 20px in 16px font size */
  }
`
