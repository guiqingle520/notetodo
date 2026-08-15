import { Cpu, KeyRound, ShieldCheck, Webhook } from 'lucide-react'
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
  return (
    <aside>
      <div className="settings-brand">
        <span className="brand-mark">N</span>
        <strong>设置</strong>
      </div>
      <nav aria-label="设置分类">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={activeSection === id ? 'is-active' : ''}
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => onSelect(id)}
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
