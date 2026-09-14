export interface ChatContentSegment {
  type: 'text' | 'code'
  content: string
}

export function extractCodeBlocks(content: string): ChatContentSegment[] {
  const segments: ChatContentSegment[] = []
  // Requires a closing fence — an unclosed one (e.g. a reply truncated by the
  // provider's token limit) intentionally falls back to a single plain-text
  // segment (stray backticks and all) rather than guessing at the boundary.
  const fence = /```[^\n]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'code', content: match[1].trimEnd() })
    lastIndex = fence.lastIndex
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }
  return segments
}
