export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** Converts stored editor HTML to inert, line-oriented text for history UI. */
export function historyTextLines(html: string, limit = 240) {
  const withBreaks = html.replace(/<\/(?:p|h[1-6]|li|blockquote|pre|aside|details|figure|nav|div)>/giu, '$&\n')
  const document = new DOMParser().parseFromString(withBreaks, 'text/html')
  document.querySelectorAll('script,style,iframe').forEach((element) => element.remove())
  const lines = (document.body.textContent ?? '')
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
  return lines.length > limit ? [...lines.slice(0, limit), `…其余 ${lines.length - limit} 行未展开`] : lines
}

/**
 * Bounded LCS diff keeps comparison predictable even for large imported pages.
 * Inputs are capped by historyTextLines, so memory is below 60k matrix cells.
 */
export function diffHistoryHtml(beforeHtml: string, afterHtml: string): DiffLine[] {
  const before = historyTextLines(beforeHtml)
  const after = historyTextLines(afterHtml)
  const matrix = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1))
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      matrix[left]![right] = before[left] === after[right]
        ? matrix[left + 1]![right + 1]! + 1
        : Math.max(matrix[left + 1]![right]!, matrix[left]![right + 1]!)
    }
  }
  const result: DiffLine[] = []
  let left = 0; let right = 0
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) { result.push({ kind: 'same', text: before[left]! }); left += 1; right += 1 }
    else if (matrix[left + 1]![right]! >= matrix[left]![right + 1]!) { result.push({ kind: 'removed', text: before[left++]! }) }
    else result.push({ kind: 'added', text: after[right++]! })
  }
  while (left < before.length) result.push({ kind: 'removed', text: before[left++]! })
  while (right < after.length) result.push({ kind: 'added', text: after[right++]! })
  return result
}
