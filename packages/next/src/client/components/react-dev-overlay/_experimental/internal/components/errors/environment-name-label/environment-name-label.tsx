import { noop as css } from '../../../helpers/noop-template'

export function EnvironmentNameLabel({
  environmentName,
}: {
  environmentName: string
}) {
  return <span data-nextjs-environment-name-label>{environmentName}</span>
}

export const ENVIRONMENT_NAME_LABEL_STYLES = css`
  [data-nextjs-environment-name-label] {
    padding: var(--size-0_5) var(--size-1_5);
    margin: 0;
    /* used --size instead of --rounded because --rounded is missing 6px */
    border-radius: var(--size-1_5);
    background: var(--color-gray-300);
    font-weight: 600;
    font-size: var(--size-font-11);
    color: var(--color-gray-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-5);
  }
`
