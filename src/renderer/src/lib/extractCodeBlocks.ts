export interface ChatContentSegment {
  type: 'text' | 'code'
  content: string
  language?: string
  filename?: string
}

export function parseFenceMeta(raw: string): { language?: string; filename?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const colon = trimmed.match(/^([A-Za-z0-9_+-]+)\s*:\s*(.+)$/)
  if (colon) {
    return { language: colon[1], filename: colon[2].trim() }
  }
  const parts = trimmed.split(/\s+/)
  const first = parts[0]
  const rest = parts.slice(1).join(' ').trim()
  if (rest) return { language: first, filename: rest }
  if (/\.(mq5|mq4|ex5|ex4|pine)$/i.test(first)) return { filename: first }
  return { language: first }
}

export function sanitizeScriptName(raw: string): string | null {
  let name = raw.trim().replace(/^["'`]+|["'`]+$/g, '')
  name = name.replace(/\\/g, '/')
  const slash = name.lastIndexOf('/')
  if (slash >= 0) name = name.slice(slash + 1)
  name = name.replace(/\.(mq5|mq4|ex5|ex4|pine)$/i, '')
  name = name.replace(/[<>:"|?*]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name || name === '.' || name === '..') return null
  if (name.length > 80) name = name.slice(0, 80).trim()
  return name || null
}

export function extractScriptName(
  content: string,
  precomputedBlock?: ChatContentSegment | null
): string | null {
  const mark = content.match(/<!--ql-file:\s*([^>]+?)-->/i)
  if (mark) return sanitizeScriptName(mark[1])
  const line = content.match(/^(?:Rename|File(?:name)?|Script):\s*(.+)$/im)
  if (line) return sanitizeScriptName(line[1])
  const block =
    precomputedBlock !== undefined ? precomputedBlock : latestCodeBlock(content, { allowOpenFence: true })
  if (block?.filename) return sanitizeScriptName(block.filename)
  return null
}


// An empty or whitespace-only fence carries nothing worth treating as code —
// returning null here (instead of a hollow segment) means every consumer
// that only wants real code doesn't need its own `.content.trim()` guard.
function codeSegment(rawFence: string, content: string): ChatContentSegment | null {
  if (!content.trim()) return null
  const meta = parseFenceMeta(rawFence)
  return {
    type: 'code',
    content,
    language: meta.language,
    filename: meta.filename
  }
}

export function extractCodeBlocks(
  content: string,
  opts?: { allowOpenFence?: boolean }
): ChatContentSegment[] {
  const segments: ChatContentSegment[] = []
  // Requires a closing fence — an unclosed one (e.g. a reply truncated by the
  // provider's token limit) intentionally falls back to a single plain-text
  // segment (stray backticks and all) rather than guessing at the boundary.
  const fence = /```([^\n]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    const segment = codeSegment(match[1], match[2].trimEnd())
    if (segment) segments.push(segment)
    lastIndex = fence.lastIndex
  }

  if (lastIndex < content.length) {
    const rest = content.slice(lastIndex)
    const openStart = rest.search(/```[^\n]*\n/)
    if (opts?.allowOpenFence && openStart >= 0) {
      const open = rest.slice(openStart)
      const closed = /```[\s\S]*```/.test(open)
      if (!closed) {
        if (openStart > 0) {
          segments.push({ type: 'text', content: rest.slice(0, openStart) })
        }
        const header = open.match(/^```([^\n]*)\n([\s\S]*)$/)
        if (header) {
          const segment = codeSegment(header[1], header[2].trimEnd())
          if (segment) segments.push(segment)
          return segments
        }
      }
    }
    segments.push({ type: 'text', content: rest })
  }
  return segments
}

export function latestCodeBlock(
  content: string,
  opts?: { allowOpenFence?: boolean }
): ChatContentSegment | null {
  const blocks = extractCodeBlocks(content, opts).filter((segment) => segment.type === 'code')
  return blocks[blocks.length - 1] ?? null
}

// The canonical list of top-level MQL5 program entry points (across Expert
// Advisors, indicators, and scripts) — shared with mql5Language.ts's syntax
// highlighter so the two don't silently drift on which functions count.
export const MQL5_LIFECYCLE_FUNCTIONS = [
  'OnInit',
  'OnDeinit',
  'OnTick',
  'OnTimer',
  'OnStart',
  'OnCalculate'
] as const

const MQL5_ENTRY_POINT_RE = new RegExp(`\\b(${MQL5_LIFECYCLE_FUNCTIONS.join('|')})\\s*\\(`)

export function isFullMql5Script(code: string): boolean {
  return MQL5_ENTRY_POINT_RE.test(code)
}

export function isFullPineScript(code: string): boolean {
  return /(?:^|\n)\s*\/\/@version\s*=/.test(code) || /\b(?:indicator|strategy|library)\s*\(/.test(code)
}

export function isFullLabScript(code: string): boolean {
  return isFullMql5Script(code) || isFullPineScript(code)
}

// Gates whether a still-streaming code block should be live-written into the
// editor: a short conversational snippet (no program entry point) must never
// overwrite the draft, only an actual MQL5 or Pine rewrite should stream live.
export function shouldLiveApplyBlock(content: string): boolean {
  return Boolean(content.trim()) && isFullLabScript(content)
}
