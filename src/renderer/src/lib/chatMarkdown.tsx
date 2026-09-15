import type { JSX } from 'react'

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }

export type MdBlock =
  | { type: 'h'; level: 1 | 2 | 3; inlines: MdInline[] }
  | { type: 'p'; inlines: MdInline[] }
  | { type: 'ul'; items: MdInline[][] }
  | { type: 'ol'; items: MdInline[][] }
  | { type: 'quote'; inlines: MdInline[] }
  | { type: 'hr' }

// The italic alternative requires non-whitespace immediately inside both
// asterisks (CommonMark's flanking-delimiter rule) so a spaced-out
// multiplication operator like "lots * pip_value * distance" in prose isn't
// mistaken for emphasis markup.
const INLINE_RE = /(\*\*[^*]+?\*\*|`[^`]+`|\*(?:\S(?:[^*]*\S)?)\*)/g

export function parseInlines(text: string): MdInline[] {
  const nodes: MdInline[] = []
  let last = 0
  let match: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push({ type: 'bold', value: token.slice(2, -2) })
    } else if (token.startsWith('`')) {
      nodes.push({ type: 'code', value: token.slice(1, -1) })
    } else {
      nodes.push({ type: 'italic', value: token.slice(1, -1) })
    }
    last = match.index + token.length
  }
  if (last < text.length) {
    nodes.push({ type: 'text', value: text.slice(last) })
  }
  return nodes.length > 0 ? nodes : [{ type: 'text', value: text }]
}

function heading(line: string): MdBlock | null {
  const match = line.match(/^(#{1,3})\s+(.+)$/)
  if (!match) return null
  const level = match[1].length as 1 | 2 | 3
  return { type: 'h', level, inlines: parseInlines(match[2].trim()) }
}

function bullet(line: string): string | null {
  const match = line.match(/^[-*]\s+(.+)$/)
  return match ? match[1] : null
}

function numbered(line: string): string | null {
  const match = line.match(/^\d+[.)]\s+(.+)$/)
  return match ? match[1] : null
}

function quote(line: string): string | null {
  const match = line.match(/^>\s?(.*)$/)
  return match ? match[1] : null
}

function isSpecial(line: string): boolean {
  return (
    heading(line) !== null ||
    bullet(line) !== null ||
    numbered(line) !== null ||
    quote(line) !== null ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())
  )
}

export function parseMarkdownBlocks(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const head = heading(line)
    if (head) {
      blocks.push(head)
      i += 1
      continue
    }

    const bulletText = bullet(line)
    if (bulletText !== null) {
      const items: MdInline[][] = []
      while (i < lines.length) {
        const item = bullet(lines[i])
        if (item === null) break
        items.push(parseInlines(item))
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const numberedText = numbered(line)
    if (numberedText !== null) {
      const items: MdInline[][] = []
      while (i < lines.length) {
        const item = numbered(lines[i])
        if (item === null) break
        items.push(parseInlines(item))
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const quoteText = quote(line)
    if (quoteText !== null) {
      const parts: string[] = []
      while (i < lines.length) {
        const item = quote(lines[i])
        if (item === null) break
        parts.push(item)
        i += 1
      }
      blocks.push({ type: 'quote', inlines: parseInlines(parts.join(' ')) })
      continue
    }

    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'p', inlines: parseInlines(para.join('\n')) })
  }

  return blocks
}

function Inlines({ nodes }: { nodes: MdInline[] }): JSX.Element {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'bold') return <strong key={i}>{node.value}</strong>
        if (node.type === 'italic') return <em key={i}>{node.value}</em>
        if (node.type === 'code') return <code key={i}>{node.value}</code>
        return <span key={i}>{node.value}</span>
      })}
    </>
  )
}

export function MarkdownBlocks({ text }: { text: string }): JSX.Element | null {
  const blocks = parseMarkdownBlocks(text)
  if (blocks.length === 0) return null
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3')
          return (
            <Tag key={i} className={`ea-chat-md-h ea-chat-md-h${block.level}`}>
              <Inlines nodes={block.inlines} />
            </Tag>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="ea-chat-md-ul">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inlines nodes={item} />
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="ea-chat-md-ol">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inlines nodes={item} />
                </li>
              ))}
            </ol>
          )
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={i} className="ea-chat-md-quote">
              <Inlines nodes={block.inlines} />
            </blockquote>
          )
        }
        if (block.type === 'hr') {
          return <hr key={i} className="ea-chat-md-hr" />
        }
        return (
          <p key={i}>
            <Inlines nodes={block.inlines} />
          </p>
        )
      })}
    </>
  )
}
