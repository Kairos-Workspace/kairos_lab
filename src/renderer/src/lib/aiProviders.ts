import type { AiProviderKind } from '@shared/types'

export function modelLabel(id: string): string {
  const slash = id.lastIndexOf('/')
  return slash >= 0 ? id.slice(slash + 1) : id
}

// The fetched model list for `id` only describes the profile's currently
// *saved* provider. While the user is mid-edit and has switched the Provider
// dropdown away from that saved kind, the cached list belongs to a different
// provider and must not be shown as if it were valid for the new selection.
export function fetchedModelsFor(params: {
  modelsById: Record<string, string[]>
  id: string
  selectedProvider: AiProviderKind
  savedProvider: AiProviderKind | null
}): string[] {
  if (params.savedProvider !== null && params.selectedProvider !== params.savedProvider) return []
  return params.modelsById[params.id] ?? []
}

// The selected provider id is stored as a raw id that can dangle relative to
// the current provider list (e.g. the selected profile got deleted). Keep it
// if it's still valid, otherwise fall back to the first available provider.
export function pickValidProviderId(
  candidateId: string | null,
  providers: { id: string }[]
): string | null {
  if (candidateId !== null && providers.some((p) => p.id === candidateId)) return candidateId
  return providers[0]?.id ?? null
}
