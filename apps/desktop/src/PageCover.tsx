import { ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Page cover chrome stays separate from the editor document and its sync lifecycle. */
export function PageCover({
  source,
  onChange,
  onRemove,
}: {
  source: string
  onChange: () => void
  onRemove: () => void
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [source])

  return (
    <section className={`page-cover ${failed ? 'is-error' : ''}`} aria-label="页面封面">
      {failed ? (
        <div className="page-cover-fallback" role="status">
          <ImageOff size={20} />
          <span>封面图片无法显示</span>
        </div>
      ) : (
        <img src={source} alt="" onError={() => setFailed(true)} />
      )}
      <div className="page-cover-actions" role="group" aria-label="封面操作">
        <button onClick={onChange}>更改封面</button>
        <button onClick={onRemove}>移除</button>
      </div>
    </section>
  )
}
