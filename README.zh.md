# dsh-skill-manager

DeepSeek Harness 的可视化 **Skill 管理器**：启用/停用、默认加载、分类、智能归类、剪贴板导入，全部在设置页里点按完成，不用手动改文件。

[English](README.md) | [中文](README.zh.md)

> 版本 0.2.0 起改为**可独立安装的插件包**：不再需要给 deepseek-harness 打宿主补丁，而是作为 npm 包（bundle patch + 浏览器模块）装进 profile。旧的「宿主补丁 + 客户端包」实现保留在 [`legacy-client/`](legacy-client/)，仅作参考。

---

## 它解决什么问题

技能就是 `skills/` 下的一个个 `SKILL.md`（Markdown + YAML frontmatter）。技能一多，手工管理会撞上四件事：

- **看不见**：技能散落在项目根、用户根、`.agents` 根里，哪个在生效、哪个被同名遮蔽，没人说得清；
- **关不掉**：想临时停用一个技能，只能改文件或删目录，改完还得记得改回来；
- **组织不了**：几十个技能平铺在一个列表里，没有分类；
- **反复输入**：每次开新对话都要手动 `/xxx`，常用的规则没法「默认带上」。

这个插件把这些变成设置页里的开关、标签和按钮。

## 功能

| 能力 | 说明 |
| --- | --- |
| **启用 / 停用** | 每个技能一个开关。停用通过注册表策略覆盖实现，**不改动源文件**，随时可撤销，卸载插件后自动恢复原状。 |
| **默认加载** | 标记为「默认加载」的技能，其正文会注入每个新会话的系统提示词（`skill-manager:default-loaded` 段），开新对话即生效。 |
| **分类管理** | 新建 / 改名 / 删除分类，可给分类配额外关键词；一个技能可属于多个分类；分类栏实时显示成员计数。 |
| **智能归类** | 一键按关键词把未归类技能分到对应分类。纯本地规则、无需 API key、结果可解释（会显示命中的关键词）。首次使用自动建立 6 个默认分类：设计 / 竞品分析 / 市场分析 / 项目规划 / 开发 / 运营。 |
| **剪贴板导入** | 把一段 `SKILL.md`（可带 frontmatter）粘进面板直接建成技能；名称自动取 `name:`、首个一级标题或转写。 |
| **载入当前对话** | 一键把 `/name` 复制到剪贴板，你自己粘贴回车 — **绝不会自动发送消息**。 |
| **编辑 SKILL.md** | 面板内新建、编辑、删除技能；kebab-case 名校验、不覆盖已有技能、保留未托管的 frontmatter 键。 |
| **遮蔽提示** | 同名技能被更高优先级根遮蔽时明确标出，避免「改了却没生效」。 |

## 安装

```powershell
# 本地开发：链接安装（改宿主代码需重启应用）
dsh plugin --profile desktop add link:D:\deepseek-harness\dsh-skill-manager

# 或先打包再安装
npm pack
dsh plugin --profile desktop add .\dsh-skill-manager-0.2.0.tgz
```

安装后**重启 DeepSeek Harness 应用**（宿主插件在启动时加载），再刷新页面。之后 设置 → **技能** 会出现管理面板。

卸载：

```powershell
dsh plugin --profile desktop remove dsh-skill-manager
```

## 工作原理

- **宿主半边**（`lib/`）：
  - 向 `ctx.skills` 注册 **rank 0 覆盖提供方**，只为「被停用的技能」发候选，从而在同名裁决中赢过文件系统提供方（rank 100–600）——这就是「关掉但不改文件」；
  - agent preset 会再挂一次 `dsh-skill-filesystem`，所以还要在每个 `agent/created` 的 `agent.ctx` 上再注册一次，否则会被 preset 层压掉；
  - 通过 `systemPrompt.section({ name: 'skill-manager:default-loaded', order: 7000 })` 注入默认加载技能；
  - 通过 `connection.fetch.register` 在官方 `/api` 通道下注册 `/api/dsh-skill-manager/*`（Host/Origin 校验与会话鉴权由宿主完成）。
- **浏览器半边**（`client/src/client/`）：注册 `settings.section` 槽位，数据全部走上面那组 `/api` 路由；打包成 `window.__ModuleLoader__.load({ id, factory })` 形态，只依赖 `react`。
- **状态**：`$DSH_HOME/skill-manager/preferences.json`（启停、默认加载、分类），只存用户显式决定，不缓存磁盘推导结果。

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 定向覆盖：

```yaml
- id: dsh-skill-manager
  name: dsh-skill-manager
  config:
    customSkillDirs: ['D:/shared-skills']
    log: false
```

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `includeDefaultRoots` | `true` | 是否扫描项目根与用户根 |
| `customSkillDirs` | `[]` | rank 300 的额外技能根 |
| `bundledSkillDir` | `$DSH_BUNDLED_SKILL_DIR` | rank 600 的内置根（只读） |
| `dshHome` / `agentsHome` | `$DSH_HOME` / `$DSH_AGENTS_HOME` | 根目录解析基准 |
| `log` | `true` | 是否写 `$DSH_HOME/skill-manager/skill-manager.log` |

## 开发

```sh
npm install
npm run build          # 用 esbuild 打 client/client.js
node test/host.test.mjs    # 目录/端口/归类/写操作的单测
node test/plugin.test.mjs  # 用假 cordis 上下文跑通接线与全部 /api 端点
```

`npm test`（`node --test test/`）在受限环境里会因测试运行器要起子进程而失败，这种情况下直接 `node <file>` 逐个跑。

## 已知限制

- 「默认加载」注入的是**全局**提示词段，作用于所有会话，暂不支持按项目/按 agent 区分。
- 只管理与 `dsh-skill-filesystem` 对齐的 DSH 技能根，不聚合 Claude / Cursor / Codex 等其它 Agent 目录。
- 删除技能是永久的（无回收站），面板里有二次确认。

## 许可证

MIT。旧版 `legacy-client/` 与新版均由本项目维护；实现思路参考了社区同类插件（@lolkda/dsh-skills-manager、@wulongxi/dsh-skills-hub）的公开做法。
