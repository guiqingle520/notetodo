import { Command, Keyboard, Search, Sparkles, X } from 'lucide-react'
import { useEffect } from 'react'
import { useDialogFocus } from './use-dialog-focus'

const shortcuts = [
  { keys: ['Ctrl', 'K'], label: '搜索工作区', icon: Search },
  { keys: ['/'], label: '打开内容块菜单', icon: Command },
  { keys: ['@'], label: '提及其他页面', icon: Command },
  { keys: ['Esc'], label: '关闭当前弹窗或菜单', icon: X },
]

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>()

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="modal-backdrop help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="帮助与快捷键"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Keyboard size={18} />
            <span>
              <strong>帮助与快捷键</strong>
              <small>快速找到 NoteTodo 的常用操作</small>
            </span>
          </div>
          <button autoFocus onClick={onClose} aria-label="关闭帮助">
            <X size={16} />
          </button>
        </header>
        <main>
          <section className="help-shortcuts" aria-labelledby="help-shortcuts-title">
            <h2 id="help-shortcuts-title">键盘快捷键</h2>
            {shortcuts.map(({ keys, label, icon: Icon }) => (
              <div key={label}>
                <Icon size={15} />
                <span>{label}</span>
                <kbd>{keys.join(' + ')}</kbd>
              </div>
            ))}
          </section>
          <section className="help-ai-note">
            <Sparkles size={17} />
            <div>
              <strong>AI 工作副驾驶</strong>
              <p>在任意页面右侧打开 AI，可以基于当前页面或所选文本问答和写入内容。</p>
            </div>
          </section>
        </main>
        <footer>所有数据默认保存在本机工作区。</footer>
      </section>
    </div>
  )
}
