# @deepseek-ai/dsh-client-ui-skill-manager

[English](README.md) | 中文

> **构建上下文**：这是 DeepSeek Harness 插件包——它在 harness monorepo 内构建（`packages/client/ui-skill-manager`），那里有共享的 tsdown 预设与平台模块表。以下命令需在包含本包的 `deepseek-harness` checkout 中运行（见仓库根目录 `docs/INSTALL.md` 的 Route A）。

用于 DeepSeek Harness Web GUI 的侧边栏 Skill 管理面板：列出、新建、编辑、删除**用户自有**的 SKILL.md 文件。它是宿主 Skill 创作能力（`@deepseek-ai/dsh-host-apiproxy` 上的 `skill.create / skill.read / skill.update / skill.delete` RPC）的配套 UI，通过浏览器 wire 客户端驱动这些 RPC。

## 这是什么

- 一个仅浏览器端的 Cordis 插件（`platform: "web"`）。它是纯 UI 插件，node 半段是空的 `apply()`，因此只出现在 Loader 中；所有行为都在 `./client` 导出中，通过 `dsh.client` 声明被发现。
- 注册进 `sidebar.footer.action` 槽位（由 `@deepseek-ai/dsh-client-ui-sidebar` 声明），与 `ui-cordis` 把面板放在设置旁的方式一致。触发按钮是一个徽章按钮，展开固定的列表面板；用户自有技能的行提供编辑/删除按钮，面板内有新建表单与删除确认。
- 创作动词通过连接 API 客户端（`ctx.get('connection').api.skills`）调用 wire 的 skill RPC，以当前会话 id 定位。写入落在宿主的**用户技能根目录**（`$DSH_HOME/skills/<name>/SKILL.md`）——绝不放进项目或 bundled 根目录——并同步失效宿主的技能目录。

## 模型体验

该面板是用户管理界面。它自己不触碰模型的运行时目录：宿主的 filesystem 提供者会在下一次 `skill.list` 时重新读取用户技能根目录，因此新建/编辑/删除的技能会在下次读取时反映到面向模型的目录（及 `/name` 调用入口）。本插件不添加提示文本、token 或自身 KV-cache 条目。

## 开发

打包与监听：

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager watch
pnpm run dev:web   # live GUI at http://127.0.0.1:3080 (restart after adding the package)
```

运行浏览器 spec：

```sh
pnpm vitest run packages/client/ui-skill-manager
```

## 已知限制与待办工作

- **仅用户自有技能** — 面板管理宿主 `$DSH_HOME/skills` 根目录下的技能。项目（`.dsh/skills`、`.agents/skills`）与 bundled 技能只读列出（无编辑/删除操作）；从 GUI 创作它们被刻意不支持，以免静默改写仓库或部署内容。
- **依赖 filesystem 技能提供者** — `skill.create/read/update/delete` 需要已注册、且带用户可写根目录的提供者（`dsh-skill-filesystem`）。没有它时，面板的动词会以只读错误码失败，而不是假装成功。
- **重命名 = 删除 + 新建** — 名称即技能目录名，因此重命名不是单一动词；编辑表单锁定名称字段，用户需在新名称下删除并重建。
