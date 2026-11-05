/**
 * 宿主半边入口。
 *
 * 挂载后做四件事：
 *  1. 向 `ctx.skills` 注册 rank 0 的覆盖提供方，让「停用」在不改源文件的前提下生效；
 *     并给每个 agent 作用域再注册一次（agent preset 会再挂一次 dsh-skill-filesystem，
 *     只在宿主层注册会被 preset 层压掉）。
 *  2. 通过 `systemPrompt.section` 把「默认加载」的技能正文注入每次装配。
 *  3. 在官方 `/api` 通道下注册 `/api/dsh-skill-manager/*`，供设置面板读写。
 *  4. 把偏好落在 `$DSH_HOME/skill-manager/preferences.json`。
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import Schema from '@deepseek-ai/schemastery'

import { listSkills } from './catalog.js'
import { createProvider, PROVIDER_NAME } from './provider.js'
import { installRoutes, ROUTE_PREFIX } from './routes.js'
import { listRoots, resolveAgentsHome, resolveDshHome, repoRoot } from './roots.js'
import { loadPreferences, normalizePreferences, preferencesPath, savePreferences } from './store.js'
import { renderDefaultLoaded } from './operations.js'

/** cordis 插件名，同时是 profile 里那一行的 id 来源。 */
export const name = 'dsh-skill-manager'

/** 只声明技能注册表；Web 与提示词两半走「就绪后再装」。 */
export const inject = ['skills']

/** 插件配置。 */
export const Config = Schema.object({
  includeDefaultRoots: Schema.boolean().default(true).description('是否包含项目根与用户根'),
  customSkillDirs: Schema.array(Schema.string()).default([]).description('rank 300 的额外技能根目录'),
  bundledSkillDir: Schema.string().description('rank 600 的内置技能根目录，只读'),
  dshHome: Schema.string().description('Harness 配置根，默认 $DSH_HOME 或 ~/.dsh'),
  agentsHome: Schema.string().description('共享 agent 配置根，默认 $DSH_AGENTS_HOME 或 ~/.agents'),
  provider: Schema.string().default('deepseek-account').description('翻译 / 描述推荐使用的模型提供方'),
  model: Schema.string().default('deepseek-flash').description('翻译 / 描述推荐使用的模型'),
  log: Schema.boolean().default(true).description('是否把操作追加到 $DSH_HOME/skill-manager/skill-manager.log'),
})

/**
 * 收敛配置。
 * @param {object} config - 原始配置
 * @returns {object} 归一化配置
 */
export function normalizeConfig(config = {}) {
  return {
    includeDefaultRoots: config.includeDefaultRoots !== false,
    customSkillDirs: Array.isArray(config.customSkillDirs) ? config.customSkillDirs.filter((dir) => typeof dir === 'string') : [],
    bundledSkillDir: typeof config.bundledSkillDir === 'string' ? config.bundledSkillDir : undefined,
    dshHome: typeof config.dshHome === 'string' && config.dshHome.trim() ? config.dshHome.trim() : resolveDshHome(),
    agentsHome: typeof config.agentsHome === 'string' && config.agentsHome.trim() ? config.agentsHome.trim() : resolveAgentsHome(),
    provider: typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : 'deepseek-account',
    model: typeof config.model === 'string' && config.model.trim() ? config.model.trim() : 'deepseek-flash',
    log: config.log !== false,
  }
}

/**
 * 组装运行时状态。
 * @param {object} [config] - 插件配置
 * @returns {object} 运行时
 */
export function createRuntime(config = {}) {
  const settings = normalizeConfig(config)
  const loaded = loadPreferences(settings.dshHome)
  let state = loaded.preferences
  let defaultCwd = process.cwd()
  const invalidators = new Set()

  const runtime = {
    settings,
    get defaultCwd() {
      return defaultCwd
    },
    setDefaultCwd(cwd) {
      if (typeof cwd === 'string' && cwd.trim()) defaultCwd = cwd.trim()
    },
    get preferencesPath() {
      return preferencesPath(settings.dshHome)
    },
    preferences() {
      return state
    },
    savePreferences(next) {
      state = normalizePreferences(next)
      savePreferences(settings.dshHome, state)
      return state
    },
    rootsFor(cwd) {
      return listRoots({ cwd: cwd ?? defaultCwd, config: settings })
    },
    catalog(cwd) {
      return listSkills(runtime.rootsFor(cwd))
    },
    invalidate() {
      for (const invalidator of [...invalidators]) {
        try {
          invalidator()
        } catch {
          // 单个注册失效失败不连累其它；下一次快照仍会重新收集。
        }
      }
    },
    log(event, detail) {
      if (!settings.log) return
      try {
        const path = `${settings.dshHome}/skill-manager/skill-manager.log`
        mkdirSync(dirname(path), { recursive: true })
        appendFileSync(path, `${new Date().toISOString()} ${event} ${detail}\n`, 'utf8')
      } catch {
        // 日志失败不影响主流程。
      }
    },
    loaded,
    invalidators,
  }
  return runtime
}

/** 运行时挂点，供同进程内其它插件直接取用。 */
export const RUNTIME_KEY = Symbol.for('dsh-skill-manager/runtime')

/**
 * 取一个 agent 自己的工作目录。
 * @param {object} agent - agent 记录
 * @returns {string|undefined} cwd
 */
export function agentCwd(agent) {
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.trim() ? cwd.trim() : undefined
}

/**
 * 取一个 agent 使用的预设名。
 * @param {object} agent - agent 记录
 * @returns {string|undefined} 预设名
 */
export function agentPreset(agent) {
  const preset = agent?.options?.agentPreset ?? agent?.session?.header?.meta?.agentPreset
  return typeof preset === 'string' && preset.trim() ? preset.trim() : undefined
}

/**
 * 归一化路径用于比较：Windows 大小写不敏感，去掉尾部分隔符。
 * @param {string} value - 路径
 * @returns {string} 归一化结果
 */
export function pathKey(value) {
  return String(value).trim().replace(/[\\/]+$/, '').toLowerCase()
}

/**
 * 算出某个 agent（或全局）实际生效的「默认加载」技能名。
 *
 * 全局默认对所有人生效；项目作用域按项目根匹配（也接受精确 cwd），
 * 预设作用域按 agent 的预设名匹配。同名去重、顺序稳定。
 * @param {object} preferences - 偏好
 * @param {{ cwd?: string, preset?: string }} [target] - 目标会话信息
 * @returns {string[]} 技能名
 */
export function defaultSkillsFor(preferences, target = {}) {
  const names = [...preferences.defaultLoaded]
  const projectKey = target.cwd ? pathKey(repoRoot(target.cwd)) : undefined
  const cwdKey = target.cwd ? pathKey(target.cwd) : undefined
  for (const scope of preferences.defaultScopes ?? []) {
    if (scope.kind === 'project') {
      const key = pathKey(scope.target)
      if (key === projectKey || key === cwdKey) names.push(...scope.skills)
    } else if (scope.kind === 'preset') {
      if (target.preset && pathKey(scope.target) === pathKey(target.preset)) names.push(...scope.skills)
    }
  }
  return [...new Set(names)]
}

/**
 * 造一个「默认加载」提示词段：段文本按目标会话（cwd / 预设）现算。
 * @param {object} runtime - 运行时
 * @param {() => { cwd?: string, preset?: string }} target - 当前目标
 * @returns {object} systemPrompt 段
 */
export function defaultLoadedSection(runtime, target) {
  return {
    name: 'skill-manager:default-loaded',
    order: 7000,
    interpolate: false,
    text: () => {
      const effective = target()
      const names = defaultSkillsFor(runtime.preferences(), effective)
      if (names.length === 0) return ''
      const catalog = runtime.catalog(effective.cwd)
      const byName = new Map(catalog.skills.map((skill) => [skill.name, skill]))
      return renderDefaultLoaded(names.map((name) => byName.get(name)).filter(Boolean))
    },
  }
}

/**
 * 维护提供方与默认加载段：宿主层一次，每个 agent 作用域一次。
 *
 * 两件事都必须注册进 agent 自己的层：provider 否则会被 preset 层的
 * dsh-skill-filesystem 压掉；systemPrompt 段否则无法按项目/预设区分
 * （同名段在作用域里会遮蔽全局段，正好用来做「全局 + 本作用域」的合并）。
 * @param {object} ctx - 上下文
 * @param {object} runtime - 运行时
 * @returns {() => void} 注销函数
 */
function installProviders(ctx, runtime) {
  const isDisabled = (skillName) => runtime.preferences().disabled.includes(skillName)
  const registerOn = (skills) =>
    skills.registerProvider((control) => {
      runtime.invalidators.add(control.invalidate)
      if (control.signal?.addEventListener) {
        control.signal.addEventListener('abort', () => runtime.invalidators.delete(control.invalidate), { once: true })
      }
      return createProvider({ rootsFor: runtime.rootsFor, isDisabled })
    })

  const hostDispose = ctx.effect(() => registerOn(ctx.skills), 'skill-manager：宿主层覆盖提供方')
  const disposers = new Map()

  const installAgent = (agent) => {
    if (!agent || typeof agent.id !== 'string' || disposers.has(agent.id)) return
    const agentCtx = agent.ctx
    const skills = agentCtx && typeof agentCtx.get === 'function' ? agentCtx.get('skills') : agentCtx?.skills
    if (!skills || typeof skills.registerProvider !== 'function') return
    const cleanups = []
    try {
      cleanups.push(registerOn(skills))
      const systemPrompt = agentCtx && typeof agentCtx.get === 'function' ? agentCtx.get('systemPrompt') : agentCtx?.systemPrompt
      if (systemPrompt && typeof systemPrompt.section === 'function') {
        cleanups.push(systemPrompt.section(defaultLoadedSection(runtime, () => ({ cwd: agentCwd(agent), preset: agentPreset(agent) }))))
      }
      disposers.set(agent.id, () => {
        for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
      })
    } catch {
      // agent 正在销毁；跳过它不影响其它。
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
    }
  }

  const uninstallAgent = (agent) => {
    const dispose = agent && disposers.get(agent.id)
    disposers.delete(agent?.id)
    if (typeof dispose === 'function') dispose()
  }

  let stopCreated
  let stopDisposed
  if (typeof ctx.on === 'function') {
    stopCreated = ctx.on('agent/created', ({ agent }) => installAgent(agent))
    stopDisposed = ctx.on('agent/disposed', ({ agent }) => uninstallAgent(agent))
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    if (agents && typeof agents.list === 'function') for (const agent of agents.list()) installAgent(agent)
  }

  return () => {
    if (typeof stopCreated === 'function') stopCreated()
    if (typeof stopDisposed === 'function') stopDisposed()
    for (const dispose of disposers.values()) if (typeof dispose === 'function') dispose()
    disposers.clear()
    hostDispose()
  }
}

/**
 * cordis 插件主体。
 * @param {object} ctx - 上下文
 * @param {object} [config] - 配置
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const runtime = createRuntime(config)
  // 测试与嵌入场景可以直接钉住工作目录；正常部署由 sessions 服务提供。
  if (typeof config?.cwd === 'string' && config.cwd.trim()) runtime.setDefaultCwd(config.cwd)
  try {
    Object.defineProperty(ctx, RUNTIME_KEY, { value: runtime, configurable: true, enumerable: false })
  } catch {
    // 冻结上下文取不到挂点，只影响进程内取用。
  }
  if (runtime.loaded.damaged) runtime.log('state-damaged', runtime.loaded.reason ?? 'preferences.json 无法使用，已按空偏好启动')

  ctx.effect(() => installProviders(ctx, runtime), 'skill-manager：技能覆盖提供方')

  /** 「可用时再装」：缺服务就等它出现，不把整个插件绑死在 Web 半边。 */
  const whenAvailable = (services, label, install) => {
    const ready = services.every((service) => typeof ctx.get === 'function' && ctx.get(service) !== undefined)
    if (ready) {
      ctx.effect(() => attempt(() => install(ctx), label, runtime), `skill-manager：${label}`)
      return
    }
    if (typeof ctx.inject !== 'function') {
      runtime.log('install-skipped', `${label}：缺少 ${services.join('、')} 服务`)
      return
    }
    runtime.log('install-deferred', `${label}：${services.join('、')} 尚未就绪`)
    ctx.inject(services, (inner) => {
      ctx.effect(() => attempt(() => install(inner), label, runtime), `skill-manager：${label}`)
    })
  }

  whenAvailable(['webServer', 'connection'], 'HTTP 端点', (inner) => {
    const connection = inner.get('connection') ?? ctx.get('connection')
    return installRoutes({ get: (service) => ctx.get(service) }, connection, runtime)
  })

  whenAvailable(['systemPrompt'], '默认加载注入', (inner) => {
    const systemPrompt = inner.get('systemPrompt') ?? ctx.get('systemPrompt')
    if (!systemPrompt || typeof systemPrompt.section !== 'function') return undefined
    // 全局段只含全局默认；agent 作用域里会有一个同名段把它遮蔽并合并项目/预设默认。
    return systemPrompt.section(defaultLoadedSection(runtime, () => ({})))
  })

  whenAvailable(['sessions'], '会话目录', (inner) => {
    const sessions = inner.get('sessions')
    if (!sessions || typeof sessions.list !== 'function') return undefined
    const sync = () => {
      const list = sessions.list()
      const first = Array.isArray(list) ? list.find((session) => typeof session?.header?.cwd === 'string') : undefined
      if (first) runtime.setDefaultCwd(first.header.cwd)
    }
    sync()
    if (typeof ctx.on === 'function') return ctx.on('session/created', sync)
    return undefined
  })
}

/**
 * 安装一个可选半边，失败只降级不抛。
 * @param {() => (() => void)|undefined} install - 安装函数
 * @param {string} label - 部件名
 * @param {object} runtime - 运行时
 * @returns {() => void} 注销函数
 */
function attempt(install, label, runtime) {
  try {
    const dispose = install()
    return typeof dispose === 'function' ? dispose : () => {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    runtime.log('install-failed', `${label}安装失败，该部分已停用：${message}`)
    console.error(`[dsh-skill-manager] ${label}安装失败，该部分已停用：${message}`)
    return () => {}
  }
}

export { PROVIDER_NAME, ROUTE_PREFIX }
