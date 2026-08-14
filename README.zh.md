# dsh-skill-manager

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 打造的侧边栏 **Skill 管理器**：浏览、新建、编辑、删除**用户自有**的 SKILL.md 文件——并配套完整的宿主端 CRUD RPC 链路（`skill.create / skill.read / skill.update / skill.delete`）。

[English](README.md) | [中文](README.zh.md)

---

## 它能做什么

Harness 从项目与用户根目录下发现的 SKILL.md 文件（带 YAML frontmatter 的 Markdown）加载 agent 技能。此前 GUI **无法编辑它们**——只有只读的 `skill.list` RPC。本项目补齐了缺失的管理界面：

- 设置旁的**侧边栏按钮**（"Skill 管理"）打开**面板**，列出所有用户可调用的技能。
- 每行显示技能名、描述与**可编辑/只读**徽标（仅用户自有技能可写）。
- **新建**：面板内表单，含名称、描述、何时使用、模型/用户调用开关与 Markdown 正文。
- **编辑**：读取用户自有技能的完整 frontmatter 与正文，修改后保存。
- **删除**：确认后移除，随后宿主目录自动刷新。

写入落在宿主的**用户技能根目录**（`$DSH_HOME/skills/<name>/SKILL.md`）——绝不放进项目或 bundled 根目录——并同步失效技能目录，使面向模型的 `/name` 调用入口在下一次读取时反映变更。

## 特性

| 领域 | 能力 |
| --- | --- |
| UI | `sidebar.footer.action` 面板（与 Cordis 面板同座），宽列/rail 布局，中英双语 |
| 宿主创作 | 新增 `skill-filesystem` writer 的 `createSkill` / `readSkill` / `updateSkill` / `removeSkill`，限定 user-dsh 根目录 |
| 链路 | `skill.create`、`skill.read`、`skill.update`、`skill.delete` RPC 贯穿 apiproxy 全栈（契约 → schema → handler → client） |
| 安全 | kebab-case 名称校验（名称即目录名）、新建绝不覆盖、可读的 not-found/conflict/read-only 错误、特权方法锁定 loopback |
| 注册表 | `SkillProvider.mutate` 可选能力 + `SkillRegistry.mutator()` 宿主访问器；每次写入后触发 `skills/change` 失效 |

## 截图

> TODO: 补充侧边栏按钮与打开面板的截图。

## 仓库结构

```
dsh-skill-manager/
├── client/                     # 独立客户端插件包 @deepseek-ai/dsh-client-ui-skill-manager
│   ├── src/client/             #   浏览器半段：面板组件、槽位 face、文案
│   ├── src/index.ts            #   空 node 半段（纯 UI 插件）
│   ├── src/invariant.ts        #   包级 invariant 伴生
│   ├── tests/                  #   浏览器插件 spec（jsdom）
│   ├── package.json            #   dsh.client 声明、peer/dev 依赖
│   └── tsdown.config.ts        #   客户端 bundle 入口
├── host/                       # 面向 deepseek-harness checkout 的宿主集成
│   ├── 0001-skill-manager-host.patch   # 完整 git 补丁（29 个文件）—— 用 `git apply` 应用
│   └── README.md               #   补丁逐个文件改了什么
├── docs/
│   └── INSTALL.md              # 详细安装指南（三条路径）
├── examples/
│   └── cordis.patch.yml        # 需要加入 web-app profile 的 bundle 行
├── LICENSE                     # MIT
└── README.md / README.zh.md
```

## 快速开始

该特性分两半：**宿主 CRUD 能力**（RPC + skill-filesystem writer）与**客户端面板**（本仓库的 `client/` 包）。客户端依赖宿主 RPC，因此先打宿主补丁，再启用插件。

```sh
# 1. 在 deepseek-harness checkout 中应用宿主补丁
cd deepseek-harness
git apply /path/to/dsh-skill-manager/host/0001-skill-manager-host.patch

# 2. 将新包纳入工作区（添加依赖 + tsconfig 引用，
#    或把 client/ 复制到 packages/client/ui-skill-manager —— 见 docs/INSTALL.md）

# 3. 重新构建客户端 bundle 并运行 GUI 开发服务器
pnpm install
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
pnpm run dev:web   # 新增包后需重启（插件发现仅在启动时运行一次）
```

随后打开 Web GUI：侧边栏设置上方会出现 **Skills** 按钮。

> 具体集成步骤取决于你的 checkout 组合方式（monorepo 工作区 vs 独立 profile bundle）。见 [docs/INSTALL.md](docs/INSTALL.md) 支持的三条路径。

## 工作原理

**宿主侧**（`host/0001-skill-manager-host.patch`）：

- `@deepseek-ai/dsh-skill` — `SkillProvider` 增加可选 `mutate?: SkillProviderMutate` 能力；`SkillRegistry` 暴露 `mutator()` 以触达那个可写提供者。
- `@deepseek-ai/dsh-skill-filesystem` — 新增 `writer.ts`，在 user-dsh 根目录实现 create/read/update/delete，`writeFileAtomic` 写入、kebab-case 名称守卫、存在性检查、每次变更后 `control.invalidate()`。
- `@deepseek-ai/dsh-host-apiproxy` — `SkillsApi` 增加 `read/create/update/delete`；`rpc-map.ts`、`skills.schema.ts`、`fetch/handler.ts`、`fetch/client.ts`、`api-proxy.ts` 端到端接线。`skill.list` 也新增 `editable` 字段。新增 wire 错误码：`skill-not-found`、`skill-conflict`、`skill-read-only`。
- `@deepseek-ai/dsh-client-connection` — 扩展浏览器类型、fixture 实现与 loopback `PRIVILEGED_METHODS` 围栏。
- 客户端 slot 目录与 web-app bundle 行已重新生成/注册。

**客户端侧**（`client/`）：

- `src/client/index.ts` 通过 `ctx.slots.inject(... register({ name, id: 'skill-manager', locale, inject }, SkillManagerPanel))` 注册进 `sidebar.footer.action`，与 Cordis 面板完全一致。
- 注入 face 以当前会话 id 调用 `ctx.get('connection').api.skills.*`——面板组件不直接接触 ctx 或 RPC 客户端。
- 文案字典（zh/en）在 `src/client/locales.ts`。

## 开发

```sh
# 在 client/ 内
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle   # 构建 lib/client.js
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager watch     # 监听模式
pnpm exec vitest run packages/client/ui-skill-manager            # 浏览器 spec
```

## 测试

- `client/tests/browser-plugin.client.spec.tsx` — 字典注册、面板列表/可编辑门控、新建表单接线（5 个用例）。
- 宿主：`skill-filesystem-writer.spec.ts`（6 个用例），以及覆盖新 RPC 行的 apiproxy schema/carrier/handler 套件。

## 许可

[MIT](LICENSE)
