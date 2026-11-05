# dsh-skill-manager

DeepSeek Harness 的可视化 **Skill 管理器**：启用/停用、默认加载、分类、智能归类、剪贴板导入，全部在侧边栏的「技能管理」里点按完成，不用手动改文件。

[English](README.md) | [中文](README.zh.md)

> 版本 0.2.0 起改为**可独立安装的插件包**：不再需要给 deepseek-harness 打宿主补丁，而是作为 npm 包（bundle patch + 浏览器模块）装进 profile。旧的「宿主补丁 + 客户端包」实现保留在 [`legacy-client/`](legacy-client/)，仅作参考。

---

## 它解决什么问题

技能就是 `skills/` 下的一个个 `SKILL.md`（Markdown + YAML frontmatter）。技能一多，手工管理会撞上四件事：

- **看不见**：技能散落在项目根、用户根、`.agents` 根里，哪个在生效、哪个被同名遮蔽，没人说得清；
- **关不掉**：想临时停用一个技能，只能改文件或删目录，改完还得记得改回来；
- **组织不了**：几十个技能平铺在一个列表里，没有分类；
- **反复输入**：每次开新对话都要手动 `/xxx`，常用的规则没法「默认带上」。

这个插件把这些变成侧边栏一级入口里的开关、标签和按钮。

## 功能

| 能力 | 说明 |
| --- | --- |
| **启用 / 停用** | 每个技能一个开关。停用通过注册表策略覆盖实现，**不改动源文件**，随时可撤销，卸载插件后自动恢复原状。 |
| **默认加载** | 标记为「默认加载」的技能，其正文会注入会话的系统提示词（`skill-manager:default-loaded` 段）。支持三种作用域：**全局**、**本项目**（按项目根匹配）、**按预设**（如 `standard`），三者合并生效。 |
| **分类管理** | 新建 / 改名 / 删除分类，可给分类配额外关键词；一个技能可属于多个分类；分类栏实时显示成员计数。 |
| **AI 智能归类** | 交给模型按**产品/项目阶段**归类（需求分析 / 商业论证 / 方案设计 / 原型美工 / 开发实现 / 测试验收 / 上线部署 / 运营增长 / 成本优化 / 协作管理 / 其他），分类名固定、不会冒出英文自造词；模型不可用时按阶段关键词表兜底，仍然是按阶段而不是按字面词。 |
| **AI 建议（自动 + 旁路）** | 打开面板就**自动为每个技能生成**描述/时机/分类/翻译，默认开启；只存在独立文件里，**不覆盖原描述**，技能行在原描述下面多一行「AI 建议」。顶部有「显示 AI 建议」开关和「一键生成 / 重新生成全部」按钮，单行可「重新生成」。可选中文 / English 输出。 |
| **导入** | 三种来源：**剪贴板**（粘贴整段 `SKILL.md`）、**目录**（走宿主原生目录选择器，没有就手填绝对路径）、**ZIP**（浏览器选文件，宿主解压；拒绝越界路径）。 |
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

安装后**重启 DeepSeek Harness 应用**（宿主插件在启动时加载），再刷新页面。侧边栏一级入口里会出现 **技能管理**。

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

## 验证

除单测外，仓库里有几个直接打运行中宿主的脚本（会读本机 `~/.dsh/.credentials.yaml` 里的浏览器会话密钥签一个合法 cookie，只访问 127.0.0.1）：

```sh
npm test                                                                   # 18 项：宿主/端点/bundle/界面渲染
node scripts/verify-live.mjs http://127.0.0.1:57788 D:\deepseek-harness    # 归类/新建/读取/停用/注册表核对/删除/还原
node scripts/verify-bundle.mjs                                             # 宿主是否真的下发了浏览器半边
```

2026-11-05 在 0.2.2-rc.1 桌面版上实测：

- `/catalog` 返回 25 个技能；新建与删除落在 `project-dsh` 根；
- 把 `smoke-test-skill` 标为停用后，`/registry` 里它的 `provider` 变成 `skill-manager`、`modelInvocable` 变成 `false` —— 覆盖提供方在真实注册表里赢得了裁决；
- 页面外壳的模块图里已出现 `dsh-skill-manager/client.js&rev=…`，实际请求合并模块地址返回 200 且包含本插件的注册代码 —— 浏览器半边确实被下发；
- `test/ui.test.mjs` 用 jsdom 把**真实构建产物**挂起来渲染真实目录数据，验证了标题、技能行、分类 chip、作用域标签、搜索过滤、点开关写回偏好、切到「本项目」后设默认会写进 `defaultScopes`。

新增功能的验证（隔离实例，[verify-features.mjs](scripts/verify-features.mjs)，9/9 通过）：`catalog` 带 `projectRoot`；目录导入与 ZIP 导入都落成技能；作用域默认写入后能读回。

## 已知限制

- 「按预设」作用域依赖会话元数据里的 `agentPreset`；没有该字段的部署只能落到全局与项目两种作用域。
- 只管理与 `dsh-skill-filesystem` 对齐的 DSH 技能根，不聚合 Claude / Cursor / Codex 等其它 Agent 目录。
- 删除技能是永久的（无回收站），面板里有二次确认。
- ZIP 导入只解压、不校验包内脚本；导入后请自己看一眼内容。

## 许可证

MIT。旧版 `legacy-client/` 与新版均由本项目维护；实现思路参考了社区同类插件（@lolkda/dsh-skills-manager、@wulongxi/dsh-skills-hub）的公开做法。
