import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Theme() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          [data-nextjs-dialog-content] {
            display: flex;
            flex-direction: column;
            width: 100%;
            margin-right: auto;
            margin-left: auto;
            outline: none;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 0.25rem 0.5rem rgba(22, 28, 45, 0.5);
            max-height: calc(100% - 3.5rem);
            overflow-y: hidden;
          }
          @media (min-width: 576px) {
            [data-nextjs-dialog-content] {
              max-width: 540px;
              box-shadow: 0 0.5rem 1rem rgba(22, 28, 45, 0.5);
            }
          }
          @media (min-width: 768px) {
            [data-nextjs-dialog-content] {
              max-width: 720px;
            }
          }
          @media (min-width: 992px) {
            [data-nextjs-dialog-content] {
              max-width: 960px;
            }
          }

          [data-nextjs-dialog-header] {
            flex-shrink: 0;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 1rem 1rem;
            /* border: */
            position: relative;
            border-color: #ff3333;
          }
          [data-nextjs-dialog-header]::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 100%;
            border-top-width: 5px;
            border-bottom-width: calc(0.375rem - 5px);
            border-top-style: solid;
            border-bottom-style: solid;
            border-top-color: inherit;
            border-bottom-color: transparent;
            border-top-left-radius: 0.375rem;
            border-top-right-radius: 0.375rem;
          }
          [data-nextjs-dialog-header] nav {
            display: flex;
            align-items: center;
          }
          [data-nextjs-dialog-header] nav > button {
            border: 1px solid #f7c8c8;
            border-radius: 50%;
            background-color: rgba(230, 0, 0, 0.1);
            color: rgba(230, 0, 0, 1);
            padding: 3px 8.1px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.25s ease;
          }
          [data-nextjs-dialog-header] nav > button:hover {
            background-color: rgba(230, 0, 0, 0.2);
          }
          [data-nextjs-dialog-header] nav > button[disabled] {
            background-color: unset;
            background-color: rgba(230, 0, 0, 0.1);
            color: rgba(230, 0, 0, 0.2);
            cursor: not-allowed;
          }
          [data-nextjs-dialog-header] nav > button:first-of-type {
            margin-right: 8px;
          }
          [data-nextjs-dialog-header] nav > span {
            font-size: 0.875rem;
            color: #757575;
            font-family: var(--font-stack-monospace);
            margin-left: 9px;
          }

          [data-nextjs-dialog-header] h4 {
            margin-bottom: 0;
            line-height: 1.5;
            margin-top: 1.2rem;
          }
          [data-nextjs-dialog-header] p {
            margin-bottom: 0;
            color: #6a6a6a;
          }
          [data-nextjs-dialog-header] button.close {
            font-size: 1.8rem;
            font-weight: 500;
            line-height: 1;
            color: #000;
            text-shadow: 0 1px 0 #fff;
            opacity: 0.4;
            background-color: transparent;
            border: 0;
            appearance: none;
            padding: 1rem 1rem;
            margin: -1rem -1rem -1rem auto;
            transition: opacity 0.25s ease;
          }
          [data-nextjs-dialog-header] button.close:hover {
            opacity: 0.7;
          }
          [data-nextjs-dialog-body] {
            position: relative;
            flex: 1 1 auto;
            padding: 1rem;
            overflow-y: auto;
          }

          [data-nextjs-call-stack-frame] > h6 {
            font-family: var(--font-stack-monospace);
            color: rgba(25, 25, 25, 1);
          }
          [data-nextjs-call-stack-frame] > p {
            padding-left: 1rem;
            font-size: 0.875rem;
            color: rgba(25, 25, 25, 0.5);
          }
        `,
      }}
    />
  )
}
