import * as React from 'react'
import { noop as css } from '../noop-template'

export function Theme() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          h1,
          h2,
          h3,
          h4,
          h5,
          h6 {
            margin-bottom: 0.5rem;
            font-weight: 500;
            line-height: 1.2;
          }

          h1 {
            font-size: 2.5rem;
          }
          h2 {
            font-size: 2rem;
          }
          h3 {
            font-size: 1.75rem;
          }
          h4 {
            font-size: 1.5rem;
          }
          h5 {
            font-size: 1.25rem;
          }
          h6 {
            font-size: 1rem;
          }

          [data-nextjs-dialog-overlay] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            overflow: auto;
            z-index: 9000;

            display: flex;
            align-content: center;
            align-items: center;
            flex-direction: column;
            justify-content: center;
            padding: 0 15px;
          }

          [data-nextjs-dialog-backdrop] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            background-color: rgba(17, 17, 17, 0.2);
            pointer-events: all;
            z-index: -1;
          }

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
          @media (min-width: 1200px) {
            [data-nextjs-dialog-content] {
              max-width: 1140px;
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
            border: none;
            border-radius: 4px;
            background-color: rgba(230, 0, 0, 0.1);
            color: rgba(230, 0, 0, 1);
            padding: 3px 9px;
            cursor: pointer;
            font-weight: 500;
          }
          [data-nextjs-dialog-header] nav > button[disabled] {
            background-color: unset;
            background-color: rgba(230, 0, 0, 0.1);
            color: rgba(230, 0, 0, 0.2);
            cursor: not-allowed;
          }
          [data-nextjs-dialog-header] nav > button:first-of-type {
            border-top-right-radius: 0px;
            border-bottom-right-radius: 0px;
            margin-right: 1px;
          }
          [data-nextjs-dialog-header] nav > button:last-of-type {
            border-top-left-radius: 0px;
            border-bottom-left-radius: 0px;
          }
          [data-nextjs-dialog-header] nav > span {
            font-size: 0.875rem;
          }

          [data-nextjs-dialog-header] h4 {
            margin-bottom: 0;
            line-height: 1.5;
          }
          [data-nextjs-dialog-header] p {
            margin-bottom: 0;
          }
          [data-nextjs-dialog-header] button.close {
            font-size: 1.5rem;
            font-weight: 700;
            line-height: 1;
            color: #000;
            text-shadow: 0 1px 0 #fff;
            opacity: 0.5;
            background-color: transparent;
            border: 0;
            appearance: none;
            padding: 1rem 1rem;
            margin: -1rem -1rem -1rem auto;
          }
          [data-nextjs-dialog-body] {
            position: relative;
            flex: 1 1 auto;
            padding: 1rem;
            overflow-y: auto;
          }
        `,
      }}
    />
  )
}
