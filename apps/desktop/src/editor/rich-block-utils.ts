export function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

export function normalizeEmbedUrl(value: string) {
  const safe = safeHttpsUrl(value)
  if (!safe) return ''
  const url = new URL(safe)
  if (url.hostname === 'youtu.be') {
    return `https://www.youtube.com/embed/${encodeURIComponent(url.pathname.slice(1))}`
  }
  if (
    ['youtube.com', 'www.youtube.com'].includes(url.hostname) &&
    url.pathname === '/watch' &&
    url.searchParams.get('v')
  ) {
    return `https://www.youtube.com/embed/${encodeURIComponent(url.searchParams.get('v')!)}`
  }
  const allowed = [
    'youtube.com',
    'vimeo.com',
    'player.vimeo.com',
    'figma.com',
    'www.figma.com',
    'loom.com',
    'www.loom.com',
    'maps.google.com',
    'www.google.com',
  ]
  return allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    ? url.toString()
    : ''
}

export function assetHashFromUrl(value: unknown) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'notetodo-asset:' && /^[0-9a-f]{64}$/u.test(url.hostname)
      ? url.hostname
      : ''
  } catch {
    return ''
  }
}

export function clampImageWidth(value: number) {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(35, Math.round(value / 5) * 5))
}

export function hostLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function formatFileMeta(mimeType: string, size: number | string | null) {
  const bytes = Number(size)
  const formatted =
    Number.isFinite(bytes) && bytes > 0
      ? bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : '大小未知'
  return `${mimeType || '文件'} · ${formatted}`
}
