import { css } from '../../../../utils/css'

export function IssuesTabSidebarFrameSkeleton() {
  return (
    <>
      <div data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar="1" />
      <div data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar="2" />
    </>
  )
}

export const DEVTOOLS_PANEL_TAB_ISSUES_SIDEBAR_FRAME_SKELETON_STYLES = css`
  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar] {
    height: var(--size-12);
    border-radius: 100px;
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar='1'] {
    width: 75%;
    margin-bottom: 8px;
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar='2'] {
    width: 36.5%;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    [data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar='1'],
    [data-nextjs-devtools-panel-tab-issues-sidebar-frame-skeleton-bar='2'] {
      animation: none;
      background: var(--color-gray-200);
    }
  }
`
