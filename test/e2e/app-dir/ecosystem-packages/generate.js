const fs = require('fs')
const { join, dirname } = require('path')
const outdent = require('outdent')

function normalizePackageName(packageName) {
  return packageName
    .replaceAll('/', '_')
    .replaceAll('@', '_')
    .replaceAll('-', '_')
    .replaceAll('.', '_')
}

function writeFile(filePath, contents) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

// function writeIndividualFiles(packageList) {
//   for (const packageName of packageList) {
//     const normalizedPackageName = normalizePackageName(packageName)

//     writeFile(
//       join(__dirname, 'app', 'packages', normalizedPackageName, 'page.js'),
//       outdent`
//     import * as ${normalizedPackageName} from '${packageName}'
//     console.log(${normalizedPackageName})

//     export default function Page() {
//         return <h1>Hello World</h1>
//     }
// `
//     )
//   }
// }

function divideArrayInChunks(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

function writeToBarrelFiles(packageList, type) {
  const arr = divideArrayInChunks(packageList, packageList.length / 4)
  for (let i = 0; i < arr.length; i++) {
    const imports = []
    const vars = []

    const chunk = arr[i]
    for (const packageName of chunk) {
      const normalizedPackageName = normalizePackageName(packageName)

      imports.push(`import * as ${normalizedPackageName} from '${packageName}'`)
      vars.push(`console.log(${normalizedPackageName})`)
    }

    writeFile(
      join(__dirname, 'app', 'list', i.toString(), 'page.js'),
      outdent`
      ${type === 'client' ? '"use client";' : ''}
    ${imports.join('\n')}
    ${vars.join('\n')}
  
    export default function Page() {
      return <h1>Hello World</h1>
    }
  `
    )
  }
}

function writePackageJson(packageList) {
  writeFile(
    join(__dirname, 'package.json'),
    JSON.stringify(
      {
        name: 'ecosystem-packages',
        private: true,
        dependencies: packageList.reduce((acc, packageName) => {
          acc[packageName] = '*'
          return acc
        }, {}),
      },
      null,
      '  '
    )
  )
}

// const serverPackageList = [
//   'sharp',
//   'nodemailer',
//   '@prisma/client',
//   'prisma',
//   'aws-sdk',
//   'node-fetch',
//   'glob',
//   'pino',
//   'formidable',
//   'aws-sdk',
//   '@trpc/server',
//   'http-proxy-middleware',
//   'server-only',
//   'winston',
//   'bcrypt',
//   'pino-pretty',
//   'fs-extra',
//   'mongoose',
//   '@sendgrid/mail',
//   'dd-trace',
//   'mongodb',
//   'firebase-admin',
//   'ioredis',
//   'react-pdf',
// ]

const packageList = [
  'axios',
  'react-hook-form',
  'date-fns',
  '@emotion/react',
  '@emotion/styled',
  'lodash',
  'react-redux',
  'classnames',
  'uuid',
  'yup',
  'clsx',
  'framer-motion',
  '@reduxjs/toolkit',
  '@hookform/resolvers',
  '@mui/material',
  'react-icons',
  'dayjs',
  'moment',
  'zod',
  'styled-components',
  'react-router-dom',
  '@headlessui/react',
  'swr',
  'next-auth',
  'graphql',
  '@tanstack/react-query',
  'js-cookie',
  '@mui/icons-material',
  'swiper',
  'formik',
  'react-intersection-observer',
  'tailwind-merge',
  'react-markdown',
  '@heroicons/react',
  'react-select',
  'react-use',
  'react-toastify',
  '@apollo/client',
  'cookie',
  'react-slick',
  'react-modal',
  'next-redux-wrapper',
  'i18next',
  'react-i18next',
  'zustand',
  'react-transition-group',
  'class-variance-authority',
  'prop-types',
  'react-dropzone',
  'redux',
  'next-themes',
  'jsonwebtoken',
  'cookies-next',
  //   'slick-carousel', // Issue with `__esModule`
  'lodash.debounce',
  '@react-google-maps/api',
  'react-datepicker',
  '@tanstack/react-table',
  'lucide-react',
  'next-seo',
  'qs',
  '@stripe/stripe-js',
  '@mui/x-date-pickers',
  'react-input-mask',
  'next-i18next',
  'nprogress',
  'chart.js',
  '@mui/lab',
  '@radix-ui/react-dialog',
  'redux-persist',
  'next-sitemap',
  'react-query',
  '@radix-ui/react-slot',
  'html-react-parser',
  'jwt-decode',
  // '@emotion/server', / Fails to resolve `@emotion/css`
  'antd',
  '@tanstack/react-query-devtools', // Crashes the process
  '@stripe/react-stripe-js',
  'react-hot-toast',
  'react-chartjs-2',
  'redux-saga',
  // 'firebase', // Can't resolve somehow
  'remark-gfm',
  '@emotion/cache',
  'file-saver',
  '@chakra-ui/react',
  '@fortawesome/react-fontawesome',
  'recharts',
  '@radix-ui/react-dropdown-menu',
  'react-table',
  '@fortawesome/fontawesome-svg-core',
  'query-string',
  'bootstrap',
  'bowser',
  '@radix-ui/react-label',
  '@vercel/analytics',
  '@radix-ui/react-select',
  'pure-react-carousel',
  'react-share',
  'isbot',
  '@radix-ui/react-popover',
  'react-popper-tooltip',
  'snakecase-keys',
  'react-player',
  'react-google-recaptcha',
  'normalizr',
  'camelize',
  'react-device-detect',
  'use-debounce',
  '@radix-ui/react-checkbox',
  '@fortawesome/free-solid-svg-icons',
  'react-scroll',
  'tslib',
  'crypto-js',
  '@radix-ui/react-tooltip',
  'daisyui',
  'immer',
  '@radix-ui/react-tabs',
  '@faker-js/faker',
  'react-number-format',
  'next-intl',
  'stripe',
  '@chakra-ui/icons',
  'react-day-picker',
  'nanoid',
  'react-infinite-scroll-component',
  '@googlemaps/js-api-loader',
  'react-cookie',
  'react-apexcharts',
  'redux-thunk',
  '@radix-ui/react-accordion',
  'react-error-boundary',
  'react-beautiful-dnd',
  'nookies',
  'dompurify',
  'lottie-react',
  'react-google-recaptcha-v3',
  'react-tooltip',
  'react-spinners',
  'react-intl',
  'socket.io-client',
  'cors',
  '@mui/x-data-grid',
  'react-gtm-module',
  'core-js',
  'react-responsive-carousel',
  'ua-parser-js',
  'graphql-tag',
  'superjson',
  '@material-ui/core',
  '@ant-design/icons',
  '@radix-ui/react-toast',
  '@mantine/hooks',
  'react-bootstrap',
  // '@trpc/client', // Crashes the process
  'encoding',
  '@tabler/icons-react',
  'react-copy-to-clipboard',
  'notistack',
  'graphql-request',
  'moment-timezone',
  // 'date-fns-tz', // Fails to resolve date-fns
  'gray-matter',
  'next-translate',
  '@radix-ui/react-icons',
  '@radix-ui/react-avatar',
  'copy-to-clipboard',
  '@radix-ui/react-switch',
  'react-is',
  '@popperjs/core',
  'i18next-browser-languagedetector',
  '@radix-ui/react-separator',
  '@trpc/react-query',
  'fuse.js',
  'react-quill',
  'react-responsive',
  'apexcharts',
  'luxon',
  '@radix-ui/react-radio-group',
  '@trpc/next',
  'recoil',
  'chalk',
  'redux-devtools-extension',
  // 'react-syntax-highlighter', // Crashes the process
  'usehooks-ts',
  '@contentful/rich-text-react-renderer',
  'react-loading-skeleton',
  // '@aws-sdk/client-s3', // Crashes the process
  'three',
  'cmdk',
  'embla-carousel-react',
  '@nextui-org/react',
  'xlsx',
  'ethers',
  'react-moment',
  'algoliasearch',
  'openai',
  'contentful',
  '@radix-ui/react-scroll-area',
  'jotai',
  'react-multi-carousel',
  'next-connect',
  '@datadog/browser-rum',
  '@dnd-kit/core',
  'qrcode.react',
  'react-paginate',
  '@fortawesome/free-brands-svg-icons',
  'rehype-raw',
  'libphonenumber-js',
  'gsap',
  'sonner',
  '@tiptap/react',
  '@react-spring/web',
  'papaparse',
  '@dnd-kit/sortable',
  'posthog-js',
  'nextjs-progressbar',
  'slugify',
  'cookie-parser',
  'qrcode',
  'jszip',
  '@radix-ui/react-navigation-menu',
  '@tiptap/starter-kit',
  '@storybook/addon-onboarding',
  'bcryptjs',
  'react-dnd',
  '@tanstack/match-sorter-utils',
  'react-popper',
  'react-countup',
  'marked',
  // 'isomorphic-unfetch', // Fails to resolve `unfetch`
  'universal-cookie',
  'react-window',
  'react-cookie-consent',
  '@t3-oss/env-nextjs',
  'html2canvas',
  '@vercel/speed-insights',
  'react-dnd-html5-backend',
  'react-textarea-autosize',
  'rxjs',
  'mobx',
  // 'mapbox-gl', // Crashes the process
  '@fortawesome/free-regular-svg-icons',
  'form-data',
  'i18next-http-backend',
  'redux-logger',
  'react-qr-code',
  '@contentful/rich-text-types',
  'react-csv',
  'react-image-crop',
  'jose',
  'jquery',
  'isomorphic-fetch',
  '@mdx-js/react',
  // 'leaflet', // Crashes the process
  'validator',
  'cross-fetch',
  'react-phone-input-2',
  'isomorphic-dompurify',
  'polished',
  '@tiptap/extension-link',
  'sanitize-html',
  '@auth0/nextjs-auth0',
  '@iconify/react',
  '@radix-ui/react-slider',
  'react-phone-number-input',
  'react-lazyload',
  'react-otp-input',
  // 'react-map-gl', // Crashes the process
  'deepmerge',
  'react-helmet',
  'numeral',
  'react-spring',
  'jspdf',
  'wagmi',
  'react-fast-marquee',
  'simplebar-react',
  'use-places-autocomplete',
  'react-leaflet',
  'google-map-react',
  '@sentry/react',
  'md5',
  'react-calendar',
]

writeToBarrelFiles(packageList, 'client')
writePackageJson(packageList)
