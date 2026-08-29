const MAX_CONTEXT_ENTRIES = 6
const MAX_CONTEXT_ENTRY_LENGTH = 180

export function appendCommittedText(history: string[], text: string): string[] {
  const normalized = text.trim().slice(0, MAX_CONTEXT_ENTRY_LENGTH)
  if (!normalized) return history.slice(-MAX_CONTEXT_ENTRIES)

  return [...history.filter((entry) => entry !== normalized), normalized].slice(-MAX_CONTEXT_ENTRIES)
}
