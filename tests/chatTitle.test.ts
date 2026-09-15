import { describe, expect, it } from 'vitest'
import { chatTitleFromText } from '../src/main/ai/chatTitle'

describe('chatTitleFromText', () => {
  it('collapses whitespace and trims', () => {
    expect(chatTitleFromText('  hello   world  ')).toBe('hello world')
  })

  it('falls back to "New chat" for empty text', () => {
    expect(chatTitleFromText('   ')).toBe('New chat')
  })

  it('truncates long text with an ellipsis', () => {
    const long = 'x'.repeat(60)
    const title = chatTitleFromText(long)
    expect(title).toBe(`${'x'.repeat(48)}...`)
  })
})
