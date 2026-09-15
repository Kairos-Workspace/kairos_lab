export function chatTitleFromText(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return 'New chat'
  if (one.length <= 48) return one
  return `${one.slice(0, 48).trim()}...`
}
