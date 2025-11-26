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
    border-radius: var(--rounded-md-2);
    background: var(--color-gray-100);
    font-weight: 600;
    font-size: var(--size-12);
    color: var(--color-gray-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-20);
  }
`
