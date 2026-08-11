export const VECTOR_DIMENSIONS = 256

/** Converts an ISO timestamp to the UTC Unix-millisecond storage representation. */
export function isoToUnixMs(value: string): number {
  const unixMs = Date.parse(value)
  if (!Number.isSafeInteger(unixMs)) throw new TypeError('Timestamp must be a valid ISO date.')
  return unixMs
}

/** Converts a persisted UTC Unix-millisecond value back to the public ISO contract. */
export function unixMsToIso(value: number): string {
  if (!Number.isSafeInteger(value)) throw new TypeError('Timestamp must be a safe integer.')
  return new Date(value).toISOString()
}

export interface RetrievalChunk {
  index: number
  heading: string
  text: string
}

export interface RankedItem {
  id: string
  [key: string]: unknown
}

/** Splits sanitized editor HTML into bounded, overlapping citation chunks. */
export function chunkPage(
  title: string,
  html: string,
  targetSize = 900,
  overlap = 140,
): RetrievalChunk[] {
  const safeHtml = String(html).replace(
    /<(?:script|style|iframe)[^>]*>[\s\S]*?<\/(?:script|style|iframe)>/giu,
    ' ',
  )
  const text = decodeEntities(
    safeHtml
      .replace(/<\/(?:p|h[1-6]|li|blockquote|pre|aside|details|figure|nav|div)>/giu, '\n')
      .replace(/<[^>]+>/gu, ' '),
  )
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n')
  if (!text) return []
  const chunks: RetrievalChunk[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + targetSize)
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('。', end),
        text.lastIndexOf('. ', end),
      )
      if (boundary > start + targetSize * 0.55) end = boundary + 1
    }
    const value = text.slice(start, end).trim()
    if (value) chunks.push({ index: chunks.length, heading: title || '无标题页面', text: value })
    if (end >= text.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks
}

/** Creates a deterministic local embedding without sending content off-device. */
export function embedText(value: string): Buffer {
  const vector = new Float32Array(VECTOR_DIMENSIONS)
  for (const token of semanticTokens(String(value).toLocaleLowerCase())) {
    const hash = fnv1a(token)
    const index = hash % VECTOR_DIMENSIONS
    vector[index] = (vector[index] ?? 0) + ((hash & 0x100) === 0 ? 1 : -1)
  }
  let magnitude = 0
  for (const number of vector) magnitude += number * number
  magnitude = Math.sqrt(magnitude) || 1
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = (vector[index] ?? 0) / magnitude
  }
  return Buffer.from(vector.buffer)
}

export function cosineSimilarity(leftBuffer: Buffer, rightBuffer: Buffer): number {
  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length % 4 !== 0) return 0
  const left = new Float32Array(leftBuffer.buffer, leftBuffer.byteOffset, leftBuffer.length / 4)
  const right = new Float32Array(rightBuffer.buffer, rightBuffer.byteOffset, rightBuffer.length / 4)
  let score = 0
  for (let index = 0; index < left.length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0)
  }
  return Number.isFinite(score) ? score : 0
}

export function fuseRankings<T extends RankedItem>(
  lexical: T[],
  semantic: T[],
  limit = 8,
): Array<T & { score: number }> {
  const scores = new Map<string, { item: T; score: number }>()
  lexical.slice(0, 40).forEach((item, rank) =>
    scores.set(item.id, {
      item,
      score: (scores.get(item.id)?.score ?? 0) + 0.45 / (60 + rank + 1),
    }),
  )
  semantic.slice(0, 40).forEach((item, rank) =>
    scores.set(item.id, {
      item,
      score: (scores.get(item.id)?.score ?? 0) + 0.55 / (60 + rank + 1),
    }),
  )
  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item, score }) => ({ ...item, score }))
}

function semanticTokens(value: string): string[] {
  const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? []
  const expanded: string[] = []
  for (const token of tokens) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      for (const character of token) expanded.push(character)
      for (let index = 0; index < token.length - 1; index += 1) {
        expanded.push(token.slice(index, index + 2))
      }
    } else expanded.push(token)
  }
  return expanded
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
}
