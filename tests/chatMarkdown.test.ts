import { describe, expect, it } from 'vitest'
import { parseInlines } from '@/lib/chatMarkdown'

describe('parseInlines', () => {
  it('does not treat multiplication asterisks surrounded by spaces as italic markers', () => {
    const nodes = parseInlines('profit = lots * pip_value * distance, so risk * multiplier matters')
    expect(nodes.some((n) => n.type === 'italic')).toBe(false)
  })

  it('still recognizes genuine italic markup with no surrounding whitespace', () => {
    const nodes = parseInlines('this is *important* text')
    expect(nodes).toContainEqual({ type: 'italic', value: 'important' })
  })

  it('still recognizes bold markup unaffected by the italic fix', () => {
    const nodes = parseInlines('this is **very important** text')
    expect(nodes).toContainEqual({ type: 'bold', value: 'very important' })
  })
})
