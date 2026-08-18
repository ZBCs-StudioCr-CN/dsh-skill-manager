# dsh-skill-manager

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 网页版 GUI 提供的可视化 **Skill 管理器**：启用、默认加载、分类、编辑你的 SKILL.md 规则，全程无需手动改文件。

[English](README.md) | [中文](README.zh.md)

---

## 它解决什么问题

DeepSeek Harness 的技能就是 `~/.dsh/skills` 下的一个个 `SKILL.md` 文件（Markdown + YAML frontmatter）。技能一多，手工管理就会遇到：

- **看不到自己有什么**——技能都是散落的文件，没有总览，也没有启用/禁用开关；
- **没法组织**——所有技能挤在一个目录，哪个技能干什么只能靠看描述；
- **反复重复劳动**——每次对话都要手动输入 `/xxx` 调用常用规则（站会、数据分析、API 设计……），没有"默认带上"的概念；
- **编辑容易出错**——frontmatter 写错一个键就静默失效，而且以前根本没有图形界面可以新建技能。

`dsh-skill-manager` 把这些全部变成侧边栏里的点按操作。

![Skill 管理面板](docs/screenshots/panel.png)

## 功能一览

| 功能 | 说明 |
| --- | --- |
| **启用 / 禁用** | 每个技能一个开关。禁用的技能从 `/name` 目录中消失，列表始终反映真实状态。 |
| **加载到当前对话** | 一键把 `/skill-name ` 复制到剪贴板——粘贴到输入框回车即可把该技能的规则带进当前对话。**绝不会自动发送消息**。 |
| **默认加载** | 每个技能一个开关，标记为"新对话自动带上"，常用的规则一开新会话就在。 |
| **分类管理** | 新建 / 重命名 / 删除分类，勾选式归类，实时成员计数；一个技能可以属于多个分类。 |
| **智能分类** | 一键把全部技能按**关键词规则**归类（本地运行、无需 API key、结果可解释）。分类可自定义关键词；首次使用自动创建 6 个默认分类（设计 / 竞品分析 / 市场分析 / 项目规划 / 开发 / 运营）。 |
| **编辑 SKILL.md** | 面板内新建、编辑、删除用户技能：kebab-case 名校验、绝不覆盖已有技能、可读的错误提示。写入 `$DSH_HOME/skills/<name>/SKILL.md` 并即时刷新技能目录。 |
| **打开文件夹** | 在宿主文件管理器中打开 `$DSH_HOME/skills` 目录。 |

## 三层概念模型

管理器把三个容易混淆的概念分开，面板里对应三种不同的控件：

1. **启用（Enable）**——技能是否可见/可调用（持久化在 `skill-preferences.json` 的 `enabled`）。
2. **加载到当前对话（Load into this conversation）**——按需把某个技能的规则带进**当前**对话（复制 `/name`，由你决定何时发送）。
3. **默认加载（Default load）**——全局默认：新对话自动带上该技能（`defaultLoaded`）。

启用与默认加载是开关；"加载到当前对话"是一次性动作。

## 安装

功能分两半：**宿主能力**（RPC + 偏好存储，以 git 补丁方式应用）与**客户端面板**（本仓库 `client/` 包）。客户端依赖宿主 RPC，因此先打宿主补丁。

```sh
# 1. 在 deepseek-harness 检出目录中应用宿主补丁
cd deepseek-harness
git apply /path/to/dsh-skill-manager/host/0001-skill-manager-host.patch

# 2. 把客户端包引入工作区（详见 docs/INSTALL.md —— 三种方式：
#    monorepo 工作区成员 / bundle 依赖 / 独立 bundle）
pnpm install
pnpm run build:lib:client

# 3. 重启 Web GUI 并硬刷新浏览器
pnpm run dev:web
```

之后侧边栏 Settings 上方会出现 **Skill 管理** 按钮。

三种安装路线详见 [docs/INSTALL.md](docs/INSTALL.md)，宿主补丁逐文件说明见 [host/README.md](host/README.md)。

## 工作原理

- **宿主侧**（`host/0001-skill-manager-host.patch`）：完整 apiproxy 链路的 `skill.*` RPC（`list/read/create/update/delete/openFolder/preferencesRead/preferencesUpdate/smartClassify`）；`skill-preferences` 存储（`$DSH_HOME/skill-preferences.json`）负责启用 / 默认加载 / 分类；`skill-filesystem` writer 负责技能编写；智能分类走关键词规则。
- **客户端**（`client/`）：`@deepseek-ai/dsh-client-ui-skill-manager` 插件注册到 `sidebar.footer.action` 槽位。面板是自绘 portal 弹窗；注入的 face 调用 `connection.api.skills.*`——组件不接触 ctx 与 RPC 客户端。内置中英文案。

## 开发

```sh
# 在 client/ 内
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle   # 构建 lib/client.js
pnpm exec vitest run packages/client/ui-skill-manager           # 浏览器组件测试（13 个用例）
```

## 许可证

[MIT](LICENSE)
