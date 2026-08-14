/** Skill manager panel UI dictionaries. */

export const NS = 'skill-manager'

/** Simplified Chinese skill manager messages. */
export const zh = {
  'panel.trigger': 'Skill 管理',
  'panel.title': 'Skill 管理',
  'panel.open.aria': '打开 Skill 管理面板',
  'panel.empty': '还没有任何可编辑的技能',
  'panel.loading': '读取中…',
  'panel.readFailed': '读取技能目录失败：{message}',
  'panel.managed': '可编辑',
  'panel.notManaged': '只读',
  'action.new': '新建',
  'action.save': '保存',
  'action.cancel': '取消',
  'action.edit': '编辑',
  'action.delete': '删除',
  'action.confirmDelete': '确认删除',
  'form.title.create': '新建技能',
  'form.title.edit': '编辑技能',
  'form.name': '名称',
  'form.description': '描述',
  'form.whenToUse': '何时使用',
  'form.userOnly': '仅用户可调用',
  'form.disabledModel': '禁止模型调用',
  'form.body': '指令正文 (Markdown)',
  'form.name.hint': 'kebab-case，例如 commit-helper',
  'confirm.deleteMessage': '确定删除技能 “{name}” 吗？此操作不可撤销。',
  'state.saved': '已保存',
  'state.deleted': '已删除',
  'error.failed': '操作失败：{message}',
} satisfies Record<string, string>

/** Translation keys owned by the skill manager namespace. */
export type SkillManagerKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill manager panel copy. */
    'skill-manager': SkillManagerKey
  }
}

/** English skill manager messages. */
export const en = {
  'panel.trigger': 'Skills',
  'panel.title': 'Skill manager',
  'panel.open.aria': 'Open the skill manager panel',
  'panel.empty': 'No editable skills yet',
  'panel.loading': 'Reading…',
  'panel.readFailed': 'Reading the skill catalog failed: {message}',
  'panel.managed': 'Editable',
  'panel.notManaged': 'Read-only',
  'action.new': 'New',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.confirmDelete': 'Delete',
  'form.title.create': 'New skill',
  'form.title.edit': 'Edit skill',
  'form.name': 'Name',
  'form.description': 'Description',
  'form.whenToUse': 'When to use',
  'form.userOnly': 'User-invocable only',
  'form.disabledModel': 'Disable model invocation',
  'form.body': 'Instructions (Markdown)',
  'form.name.hint': 'kebab-case, e.g. commit-helper',
  'confirm.deleteMessage': 'Delete skill “{name}”? This cannot be undone.',
  'state.saved': 'Saved',
  'state.deleted': 'Deleted',
  'error.failed': 'Operation failed: {message}',
} satisfies Record<SkillManagerKey, string>
