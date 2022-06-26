// Allow AMP elements to be a property on JSX.IntrinsicElements

// Only the intrinsic elements defined here will be accepted, and only with the attributes defined here
declare namespace JSX {
  interface AmpImg {
    alt?: string
    src?: string
    width?: string
    height?: string
    layout?: string
  }
  interface AmpInstallServiceWorker {
    src: string
    'data-iframe-src': string
    layout: string
  }
  interface AmpState {
    id?: string
    children?: any
    src?: string
  }
  interface AmpScript {
    id?: string
    children?: any
    layout?: string
    width?: string
    height?: string
    script?: any
    src?: string
  }
  interface AmpCarousel {
    children: React.ReactNode
    layout?:
      | 'fill'
      | 'fixed'
      | 'fixed-height'
      | 'flex-item'
      | 'intrinsic'
      | 'nodisplay'
      | 'responsive'
    width: string
    height: string
    type: 'slides' | 'carousel'
    role?: 'region' | 'list' | 'listitem'
    controls?: ''
    loop?: ''
    autoplay?: ''
    delay?: string
    id?: string
  }
  interface AmpList {
    layout?:
      | 'fill'
      | 'fixed'
      | 'fixed-height'
      | 'flex-item'
      | 'nodisplay'
      | 'responsive'
    temlate?: string
    width?: string
    height?: string
    credentials?: 'omit' | 'include'
    children: React.ReactNode
    src?: string
    binding?: string
  }
  interface IntrinsicElements {
    'amp-img': AmpImg
    'amp-install-serviceworker': AmpInstallServiceWorker
    'amp-state': AmpState
    'amp-script': AmpScript
    'amp-carousel': AmpCarousel
    'amp-list': AmpList
  }
}

// Only the intrinsic elements defined here will be accepted, attributes don't matter
// declare namespace JSX {
//     interface IntrinsicElements {
//       'amp-img': any
//       'amp-install-serviceworker': any
//       'amp-state': any
//       'amp-script': any
//       'amp-carousel': any
//       'amp-list': any
//     }
// }

// All intrinsic elements will be accepted
// declare namespace JSX {
//   interface IntrinsicElements {
//     [elemName: string]: any
//   }
// }

// Allow custom AMP attributes on HTML elements
declare namespace React {
  interface ScriptHTMLAttributes {
    target?: string
  }

  interface HTMLAttributes {
    submitting?: string
    type?: string
    on?: string
  }
}
