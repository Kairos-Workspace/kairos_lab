import { describe, expect, it } from 'vitest'
import {
  extractCodeBlocks,
  extractScriptName,
  isFullMql5Script,
  latestCodeBlock,
  shouldLiveApplyBlock,
  type ChatContentSegment
} from '@/lib/extractCodeBlocks'

describe('isFullMql5Script', () => {
  it('recognizes a timer-driven EA whose only entry point is OnTimer', () => {
    const code = 'void OnTimer() { /* poll here instead of OnTick */ }'
    expect(isFullMql5Script(code)).toBe(true)
  })
})

describe('extractCodeBlocks', () => {
  it('never emits a code segment for an empty or whitespace-only closed fence', () => {
    const segments = extractCodeBlocks('before\n```mql5\n   \n```\nafter')
    expect(segments.some((s) => s.type === 'code')).toBe(false)
  })

  it('never emits a code segment for an empty, still-open fence', () => {
    const segments = extractCodeBlocks('Here comes the code:\n```mql5\n', { allowOpenFence: true })
    expect(segments.some((s) => s.type === 'code')).toBe(false)
  })

  it('still emits a real code segment for non-empty content', () => {
    const segments = extractCodeBlocks('```mql5\nvoid OnTick() {}\n```')
    expect(segments).toContainEqual(
      expect.objectContaining({ type: 'code', content: 'void OnTick() {}' })
    )
  })
})

describe('latestCodeBlock', () => {
  it('returns null instead of an empty code segment when the only fence is blank', () => {
    expect(latestCodeBlock('```mql5\n\n```')).toBeNull()
  })
})

describe('shouldLiveApplyBlock', () => {
  it('rejects a short conversational snippet with no MQL5 entry point', () => {
    const code = 'double normalizeLots(double lots) { return NormalizeDouble(lots, 2); }'
    expect(shouldLiveApplyBlock(code)).toBe(false)
  })

  it('accepts a block once it contains a real EA entry point', () => {
    const code = 'void OnTick()\n{\n  // trade logic\n}'
    expect(shouldLiveApplyBlock(code)).toBe(true)
  })

  it('rejects an empty or whitespace-only block', () => {
    expect(shouldLiveApplyBlock('   \n  ')).toBe(false)
  })
})

describe('extractScriptName with a precomputed block', () => {
  it('reuses the passed-in block instead of re-scanning the content', () => {
    const content = 'Here is your EA:\n```mql5 MyStrategy.mq5\nvoid OnTick() {}\n```'
    const precomputed: ChatContentSegment = {
      type: 'code',
      content: 'void OnTick() {}',
      filename: 'DifferentName.mq5'
    }
    // Passing a precomputed block short-circuits the internal fallback scan,
    // so the returned name comes from `precomputed`, not from re-parsing `content`.
    expect(extractScriptName(content, precomputed)).toBe('DifferentName')
  })

  it('falls back to scanning content when no block is precomputed', () => {
    const content = 'Here is your EA:\n```mql5 MyStrategy.mq5\nvoid OnTick() {}\n```'
    expect(extractScriptName(content)).toBe('MyStrategy')
  })

  it('returns null when the precomputed block has no filename and content has no marker', () => {
    const content = 'just prose, no directive here'
    const precomputed: ChatContentSegment = { type: 'code', content: 'void OnTick() {}' }
    expect(extractScriptName(content, precomputed)).toBeNull()
  })
})
