import { Cpu, KeyRound, ShieldCheck, Webhook } from 'lucide-react'
import { useRef } from 'react'
import type { SettingsSection } from './AppSettingsData'

const sections = [
  { id: 'model', label: '模型与 AI', icon: Cpu },
  { id: 'tokens', label: 'API 访问', icon: KeyRound },
  { id: 'webhooks', label: 'Webhook', icon: Webhook },
] satisfies Array<{ id: SettingsSection; label: string; icon: typeof Cpu }>

export function AppSettingsSidebar({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSection
  onSelect: (section: SettingsSection) => void
}) {
  const navigationRef = useRef<HTMLElement>(null)
  return (
    <aside>
      <div className="settings-brand">
        <span className="brand-mark">N</span>
        <strong>设置</strong>
      </div>
      <nav ref={navigationRef} aria-label="设置分类">
        {sections.map(({ id, label, icon: Icon }, index) => (
          <button
            id={`settings-nav-${id}`}
            key={id}
            className={activeSection === id ? 'is-active' : ''}
            aria-current={activeSection === id ? 'page' : undefined}
            aria-controls={`settings-${id}`}
            tabIndex={activeSection === id ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => {
              let nextIndex: number | undefined
              if (event.key === 'ArrowDown') nextIndex = (index + 1) % sections.length
              if (event.key === 'ArrowUp')
                nextIndex = (index - 1 + sections.length) % sections.length
              if (event.key === 'Home') nextIndex = 0
              if (event.key === 'End') nextIndex = sections.length - 1
              if (nextIndex === undefined) return
              event.preventDefault()
              const nextSection = sections[nextIndex]
              if (!nextSection) return
              onSelect(nextSection.id)
              navigationRef.current
                ?.querySelectorAll<HTMLButtonElement>('button')
                [nextIndex]?.focus()
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-trust">
        <ShieldCheck size={16} />
        <span>
          <strong>本地优先</strong>
          <small>密钥不会进入页面内容</small>
        </span>
      </div>
    </aside>
  )
}
