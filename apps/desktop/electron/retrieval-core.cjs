const VECTOR_DIMENSIONS = 256

/** Splits sanitized editor HTML into bounded, overlapping citation chunks. */
function chunkPage(title, html, targetSize = 900, overlap = 140) {
  const safeHtml = String(html).replace(/<(?:script|style|iframe)[^>]*>[\s\S]*?<\/(?:script|style|iframe)>/giu, ' ')
  const text = decodeEntities(safeHtml
    .replace(/<\/(?:p|h[1-6]|li|blockquote|pre|aside|details|figure|nav|div)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' '))
    .split(/\n+/u).map((line) => line.replace(/\s+/gu, ' ').trim()).filter(Boolean).join('\n')
  if (!text) return []
  const chunks = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + targetSize)
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('。', end), text.lastIndexOf('. ', end))
      if (boundary > start + targetSize * 0.55) end = boundary + 1
    }
    const value = text.slice(start, end).trim()
    if (value) chunks.push({ index: chunks.length, heading: title || '无标题页面', text: value })
    if (end >= text.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks
}

/** Local feature-hashing embedding: deterministic, private and dependency-free. */
function embedText(value) {
  const vector = new Float32Array(VECTOR_DIMENSIONS)
  for (const token of semanticTokens(String(value).toLocaleLowerCase())) {
    const hash = fnv1a(token)
    const index = hash % VECTOR_DIMENSIONS
    vector[index] += (hash & 0x100) === 0 ? 1 : -1
  }
  let magnitude = 0
  for (const number of vector) magnitude += number * number
  magnitude = Math.sqrt(magnitude) || 1
  for (let index = 0; index < vector.length; index += 1) vector[index] /= magnitude
  return Buffer.from(vector.buffer)
}

function cosineSimilarity(leftBuffer, rightBuffer) {
  if (!Buffer.isBuffer(leftBuffer) || !Buffer.isBuffer(rightBuffer) || leftBuffer.length !== rightBuffer.length) return 0
  const left = new Float32Array(leftBuffer.buffer, leftBuffer.byteOffset, leftBuffer.length / 4)
  const right = new Float32Array(rightBuffer.buffer, rightBuffer.byteOffset, rightBuffer.length / 4)
  let score = 0
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index]
  return Number.isFinite(score) ? score : 0
}

function fuseRankings(lexical, semantic, limit = 8) {
  const scores = new Map()
  lexical.slice(0, 40).forEach((item, rank) => scores.set(item.id, { item, score: (scores.get(item.id)?.score ?? 0) + 0.45 / (60 + rank + 1) }))
  semantic.slice(0, 40).forEach((item, rank) => scores.set(item.id, { item, score: (scores.get(item.id)?.score ?? 0) + 0.55 / (60 + rank + 1) }))
  return [...scores.values()].sort((left, right) => right.score - left.score).slice(0, limit).map(({ item, score }) => ({ ...item, score }))
}

function semanticTokens(value) {
  const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? []
  const expanded = []
  for (const token of tokens) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      for (const character of token) expanded.push(character)
      for (let index = 0; index < token.length - 1; index += 1) expanded.push(token.slice(index, index + 2))
    } else expanded.push(token)
  }
  return expanded
}

function fnv1a(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0 }
  return hash
}

function decodeEntities(value) {
  return value.replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/&quot;/giu, '"').replace(/&#39;/giu, "'")
}

module.exports = { VECTOR_DIMENSIONS, chunkPage, cosineSimilarity, embedText, fuseRankings }
