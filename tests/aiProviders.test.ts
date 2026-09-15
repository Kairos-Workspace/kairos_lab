import { describe, expect, it } from 'vitest'
import { fetchedModelsFor, modelLabel, pickValidProviderId } from '@/lib/aiProviders'

describe('modelLabel', () => {
  it('strips a namespace prefix', () => {
    expect(modelLabel('aisingapore/Qwen-SEA-LION-v4.5-27B-IT')).toBe('Qwen-SEA-LION-v4.5-27B-IT')
  })

  it('returns the id unchanged when there is no slash', () => {
    expect(modelLabel('gpt-4o')).toBe('gpt-4o')
  })
})

describe('fetchedModelsFor', () => {
  it('returns the cached list when the selected provider matches the saved provider', () => {
    const models = fetchedModelsFor({
      modelsById: { p1: ['gpt-4o', 'gpt-4o-mini'] },
      id: 'p1',
      selectedProvider: 'openai',
      savedProvider: 'openai'
    })
    expect(models).toEqual(['gpt-4o', 'gpt-4o-mini'])
  })

  it('returns the cached list for a brand-new, unsaved profile', () => {
    const models = fetchedModelsFor({
      modelsById: {},
      id: 'new-id',
      selectedProvider: 'openai',
      savedProvider: null
    })
    expect(models).toEqual([])
  })

  it('discards the cached list once the provider dropdown no longer matches the saved provider', () => {
    const models = fetchedModelsFor({
      modelsById: { p1: ['gpt-4o', 'gpt-4o-mini'] },
      id: 'p1',
      selectedProvider: 'anthropic',
      savedProvider: 'openai'
    })
    expect(models).toEqual([])
  })
})

describe('pickValidProviderId', () => {
  const providers = [{ id: 'a' }, { id: 'b' }]

  it('keeps the candidate when it is still among the providers', () => {
    expect(pickValidProviderId('b', providers)).toBe('b')
  })

  it('falls back to the first provider when the candidate no longer exists', () => {
    expect(pickValidProviderId('deleted', providers)).toBe('a')
  })

  it('falls back to the first provider when the candidate is null', () => {
    expect(pickValidProviderId(null, providers)).toBe('a')
  })

  it('returns null when there are no providers at all', () => {
    expect(pickValidProviderId('a', [])).toBeNull()
  })
})
