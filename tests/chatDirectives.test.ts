import { describe, expect, it } from 'vitest'
import { stripScriptDirectives } from '@shared/chatDirectives'

describe('stripScriptDirectives', () => {
  it('removes an ql-file HTML-comment directive', () => {
    const content = '<!--ql-file: Grid Martingale-->\nHere is your EA.'
    expect(stripScriptDirectives(content)).toBe('Here is your EA.')
  })

  it('removes a Rename:/File:/Script: line', () => {
    expect(stripScriptDirectives('Rename: Grid Martingale\nHere it is.')).toBe('Here it is.')
    expect(stripScriptDirectives('Filename: Grid Martingale\nHere it is.')).toBe('Here it is.')
  })

  it('leaves ordinary prose untouched', () => {
    const content = 'Just a normal reply with no directives at all.'
    expect(stripScriptDirectives(content)).toBe(content)
  })
})
