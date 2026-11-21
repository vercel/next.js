// Renders a document (the block list of `lib/content.mjs`, what a Markdown
// or rich-text field becomes): headings, paragraphs with inline markup and
// links, lists, code blocks, quotes, images and tables.
import Image from 'next/image'
import Link from 'next/link'
import { CodeBlock } from './client/content'

function Run({ run }) {
  if (run.href) return <Link href={run.href}>{run.text}</Link>
  if (run.em) return <em>{run.text}</em>
  if (run.code) return <code>{run.text}</code>
  return run.text
}

function Block({ block }) {
  switch (block.t) {
    case 'h2':
      return <h2 id={block.id}>{block.text}</h2>
    case 'h3':
      return <h3 id={block.id}>{block.text}</h3>
    case 'p':
      return (
        <p>
          {block.runs.map((run, i) => (
            <Run key={i} run={run} />
          ))}
        </p>
      )
    case 'ul':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )
    case 'code':
      return <CodeBlock lang={block.lang} text={block.text} />
    case 'quote':
      return (
        <blockquote>
          <p>{block.text}</p>
          <cite>{block.cite}</cite>
        </blockquote>
      )
    case 'img':
      return (
        <figure>
          <Image
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            sizes="(min-width: 960px) 720px, 100vw"
          />
          <figcaption>{block.caption}</figcaption>
        </figure>
      )
    case 'table':
      return (
        <table>
          <thead>
            <tr>
              {block.head.map((cell, i) => (
                <th key={i} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    default:
      return null
  }
}

export function Prose({ blocks }) {
  return (
    <div className="prose">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}
