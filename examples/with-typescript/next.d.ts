declare module 'next/link' {
  import { Url } from 'url'

  export default class Link extends React.Component<
    {
      href: string | Url;
    },
    {}
  > {}
}
