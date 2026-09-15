import { beforeEach, describe, expect, it } from 'vitest'
import { applyLine } from '../src/main/env'

describe('applyLine', () => {
  beforeEach(() => {
    delete process.env.SEA_LION_API_KEY
    delete process.env.SOME_KEY
  })

  it('does not treat a commented-out line as an active value', () => {
    applyLine('# sk-should-not-activate')
    expect(process.env.SEA_LION_API_KEY).toBeUndefined()
  })

  it('still adopts a bare, uncommented sk- line as the SEA-LION key', () => {
    applyLine('sk-real-key')
    expect(process.env.SEA_LION_API_KEY).toBe('sk-real-key')
  })

  it('still parses a normal KEY=value line', () => {
    applyLine('SOME_KEY=value')
    expect(process.env.SOME_KEY).toBe('value')
  })
})
