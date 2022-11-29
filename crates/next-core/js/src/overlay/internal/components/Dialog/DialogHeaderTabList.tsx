import * as React from "react";

import { noop as css } from "../../helpers/noop-template";
import { clsx } from "../../helpers/clsx";
import { TabList } from "../Tabs";

export type DialogHeaderTabListProps = {
  className?: string;
  children: React.ReactNode;
};

export function DialogHeaderTabList({
  className,
  children,
}: DialogHeaderTabListProps) {
  return (
    <TabList className={clsx("dialog-header-tab-list", className)}>
      {children}
    </TabList>
  );
}

export const styles = css`
  .dialog-header > .dialog-header-tab-list {
    padding: 0;
    border: none !important;
  }

  .dialog-header-tab-list {
    height: 100%;
    display: flex;
    justify-content: start;
    align-content: center;
    border-bottom: 0;
  }

  .dialog-header-tab-list > .tab {
    display: flex;
    align-items: center;

    padding-left: calc(var(--local-padding) + var(--size-gap));
    padding-right: calc(var(--local-padding) + var(--size-gap));

    /* slight offset for the severity top border on the tabs */
    padding-top: calc(var(--local-padding) + var(--size-border));
    padding-bottom: calc(var(--local-padding) - var(--size-border));

    height: 100%;
    min-width: 250px;

    border-top: none;
    border-bottom: var(--border);
    border-left: var(--border-half);
    border-right: var(--border-half);

    color: var(--color-text-dim);
    background-color: transparent;
  }

  .dialog-header-tab-list > .tab:first-child {
    border-left: none;
  }

  .tab::after {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;

    border-top: var(--size-border-double) solid transparent;

    content: " ";
  }

  .dialog-header-tab-list > .tab:hover {
    background-color: var(--color-bg-secondary-hover);
  }

  .dialog-header-tab-list > .tab[aria-selected="true"] {
    color: var(--color-text);
    background-color: var(--color-bg);

    border-bottom-color: transparent;
  }
`;
