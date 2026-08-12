import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  AtSign,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Inbox,
  MessageSquare,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react'
import type { PageTemplate } from './data/page-templates'
import type { WorkspacePage } from './domain'
import { iconMap } from './AppSidebar'
import { useWorkspace } from './store'

interface WorkspaceHomeProps {
  onOpenPage: (pageId: string) => void
  onCreatePage: (templateId: PageTemplate['id']) => void
}

interface TodayTask {
  id: string
  title: string
  due: string
  done: boolean
}

const shortcutItems: Array<{
  id: PageTemplate['id']
  label: string
  description: string
  icon: typeof FileText
}> = [
  { id: 'blank', label: '新建空白页面', description: '从零开始记录', icon: FileText },
  { id: 'meeting', label: '会议纪要', description: '议题、结论与行动项', icon: BookOpen },
  { id: 'project', label: '项目简报', description: '目标、里程碑与风险', icon: Sparkles },
  { id: 'weekly', label: '每周计划', description: '安排一周的重点工作', icon: CalendarDays },
]

const initialTasks: TodayTask[] = [
  { id: 'review', title: '审核发布前的最终素材', due: '今天 14:00', done: false },
  { id: 'feedback', title: '向内容团队发送反馈', due: '今天', done: false },
  { id: 'standup', title: '晨会同步', due: '已完成', done: true },
]

function formatRelativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  if (elapsed < 172_800_000) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  )
}

function PageLink({ page, onOpen }: { page: WorkspacePage; onOpen: () => void }) {
  const Icon = iconMap[page.icon]
  return (
    <button className="home-page-row" aria-label={`打开页面：${page.title}`} onClick={onOpen}>
      <span className="home-page-icon">
        <Icon size={16} />
      </span>
      <span className="home-page-title">{page.title}</span>
      <span className="home-page-time">
        <Clock3 size={13} />
        {formatRelativeTime(page.lastVisitedAt)}
      </span>
      <ArrowUpRight className="home-page-arrow" size={14} />
    </button>
  )
}

export function WorkspaceHome({ onOpenPage, onCreatePage }: WorkspaceHomeProps) {
  const pages = useWorkspace((state) => state.pages)
  const [tasks, setTasks] = useState(initialTasks)
  const visiblePages = useMemo(() => pages.filter((page) => !page.archivedAt), [pages])
  const recentPages = useMemo(
    () =>
      [...visiblePages].sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt)).slice(0, 4),
    [visiblePages],
  )
  const favoritePages = useMemo(
    () => visiblePages.filter((page) => page.favorite).slice(0, 3),
    [visiblePages],
  )

  const toggleTask = (taskId: string) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)),
    )
  }

  return (
    <main className="workspace-home">
      <div className="home-topbar">
        <span>主页</span>
      </div>
      <div className="home-scroll">
        <div className="home-canvas">
          <header className="home-header">
            <div>
              <h1>早上好，Ming</h1>
              <p>从上次停下的地方继续。</p>
            </div>
            <button className="home-primary-action" onClick={() => onCreatePage('blank')}>
              <Plus size={16} />
              新建页面
            </button>
          </header>

          <div className="home-dashboard">
            <section className="home-section home-recent">
              <div className="home-section-heading">
                <h2>最近访问</h2>
                <span>你的常用页面</span>
              </div>
              <div className="home-row-list">
                {recentPages.map((page) => (
                  <PageLink key={page.id} page={page} onOpen={() => onOpenPage(page.id)} />
                ))}
              </div>
            </section>

            <section className="home-section home-tasks">
              <div className="home-section-heading">
                <h2>今日待办</h2>
                <span>{tasks.filter((task) => !task.done).length} 项待完成</span>
              </div>
              <div className="home-task-list">
                {tasks.map((task) => (
                  <button
                    className={`home-task ${task.done ? 'is-done' : ''}`}
                    key={task.id}
                    aria-label={`切换待办：${task.title}`}
                    onClick={() => toggleTask(task.id)}
                  >
                    <span className="home-checkbox">{task.done && <Check size={13} />}</span>
                    <span className="home-task-title">{task.title}</span>
                    <span className="home-task-due">{task.due}</span>
                  </button>
                ))}
              </div>
            </section>

            <aside className="home-side-column">
              <section className="home-section home-favorites">
                <div className="home-section-heading">
                  <h2>收藏页面</h2>
                  <Star size={14} />
                </div>
                <div className="home-favorite-list">
                  {favoritePages.map((page) => {
                    const Icon = iconMap[page.icon]
                    return (
                      <button key={page.id} onClick={() => onOpenPage(page.id)}>
                        <Icon size={15} />
                        <span>{page.title}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    )
                  })}
                  {!favoritePages.length && <p className="home-empty">收藏页面后会显示在这里。</p>}
                </div>
              </section>

              <section className="home-section home-inbox-summary">
                <div className="home-section-heading">
                  <h2>收件箱摘要</h2>
                  <Inbox size={14} />
                </div>
                <div className="home-inbox-item">
                  <MessageSquare size={15} />
                  <p>
                    <strong>Sarah</strong> 评论了「产品路线」<span>12 分钟前</span>
                  </p>
                </div>
                <div className="home-inbox-item">
                  <AtSign size={15} />
                  <p>
                    你在「知识库」中被提及<span>1 小时前</span>
                  </p>
                </div>
              </section>
            </aside>
          </div>

          <section className="home-section home-shortcuts">
            <div className="home-section-heading">
              <h2>快捷入口</h2>
              <span>使用模板快速开始</span>
            </div>
            <div className="home-shortcut-grid">
              {shortcutItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    aria-label={`从模板创建：${item.label}`}
                    onClick={() => onCreatePage(item.id)}
                  >
                    <span>
                      <Icon size={17} />
                    </span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
