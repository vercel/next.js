// Allow AMP elements to be a property on JSX.IntrinsicElements

// Only the intrinsic elements defined here will be accepted, and only with the attributes defined here
declare namespace JSX {
  interface AmpImg {
    alt?: string
    src?: string
    width?: string | number
    height?: string | number
    layout?: string
    fallback?: string
    children?: React.ReactNode
  }
  interface IntrinsicElements {
    'amp-img': AmpImg
  }
}

// Only the intrinsic elements defined here will be accepted, attributes don't matter
// declare namespace JSX {
//     interface IntrinsicElements {
//         'amp-img': any;
//     }
// }

// All intrinsic elements will be accepted
// declare namespace JSX {
//     interface IntrinsicElements {
//         [elemName: string]: any;
//     }
// }
