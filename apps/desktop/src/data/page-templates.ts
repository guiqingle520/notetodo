import { createUntitledPage, type PageIcon, type WorkspacePage } from '../domain'

export interface PageTemplate {
  id: 'blank' | 'meeting' | 'project' | 'weekly'
  name: string
  description: string
  icon: PageIcon
  content: string
}

// Templates are trusted, versioned application content. User-created templates
// will later use the same shape but pass through the editor HTML sanitizer.
export const pageTemplates: PageTemplate[] = [
  { id: 'blank', name: '空白页', description: '从一张干净的纸开始', icon: 'note', content: '<p></p>' },
  { id: 'meeting', name: '会议纪要', description: '议题、决策与行动项', icon: 'book', content: '<h2>会议目标</h2><p>说明这次会议要解决的问题…</p><h2>讨论纪要</h2><ul><li><p>关键信息</p></li></ul><h2>决策</h2><blockquote><p>记录最终结论与理由。</p></blockquote><h2>行动项</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>待办 · 负责人 · 日期</p></div></li></ul>' },
  { id: 'project', name: '项目简报', description: '目标、范围、里程碑与风险', icon: 'spark', content: '<h2>成功是什么</h2><p>用可验收的结果描述项目目标…</p><h2>范围</h2><ul><li><p>包含：</p></li><li><p>不包含：</p></li></ul><h2>里程碑</h2><ol><li><p>发现与方案</p></li><li><p>实现与验证</p></li><li><p>发布与复盘</p></li></ol><h2>风险台账</h2><p>风险 · 概率 · 影响 · 应对人</p>' },
  { id: 'weekly', name: '每周计划', description: '本周结果、日程与复盘', icon: 'check', content: '<h2>本周三个结果</h2><ol><li><p>结果一</p></li><li><p>结果二</p></li><li><p>结果三</p></li></ol><h2>行动清单</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>下一个具体行动</p></div></li></ul><h2>周末复盘</h2><blockquote><p>什么有效？什么要调整？</p></blockquote>' },
]

export function createPageFromTemplate(parentId: string | null, templateId: PageTemplate['id']): WorkspacePage {
  const template = pageTemplates.find((candidate) => candidate.id === templateId) ?? pageTemplates[0]!
  return { ...createUntitledPage(parentId), title: template.id === 'blank' ? '无标题' : template.name, icon: template.icon, content: template.content }
}
