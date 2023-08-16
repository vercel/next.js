import { A as a } from 'app/(post)/components/a'
import { P as p } from 'app/(post)/components/p'
import { H1 as h1 } from 'app/(post)/components/h1'
import { H2 as h2 } from 'app/(post)/components/h2'
import { H3 as h3 } from 'app/(post)/components/h3'
import { OL as ol } from 'app/(post)/components/ol'
import { UL as ul } from 'app/(post)/components/ul'
import { LI as li } from 'app/(post)/components/li'
import { HR as hr } from 'app/(post)/components/hr'
import { Tweet } from 'app/(post)/components/tweet'
import { Image } from 'app/(post)/components/image'
import { Snippet } from 'app/(post)/components/snippet'
import { Caption } from 'app/(post)/components/caption'
import { Callout } from 'app/(post)/components/callout'
import { Ref, FootNotes, FootNote } from 'app/(post)/components/footnotes'
import { Blockquote as blockquote } from 'app/(post)/components/blockquote'

export function useMDXComponents(components: {
  [component: string]: React.ComponentType
}) {
  return {
    ...components,
    a,
    h1,
    h2,
    h3,
    p,
    ol,
    ul,
    li,
    hr,
    pre: Snippet,
    img: Image,
    blockquote,
    Tweet,
    Image,
    Snippet,
    Caption,
    Callout,
    Ref,
    FootNotes,
    FootNote,
  }
}
