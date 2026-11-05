# dsh-skill-manager

A visual **skill manager** for the DeepSeek Harness Web GUI: enable/disable, default loading, categories, smart classification, and clipboard import — all from the Settings panel, no hand-editing files.

[English](README.md) | [中文](README.zh.md)

> Since 0.2.0 this ships as a **standalone installable plugin** (npm bundle patch + browser module) instead of a host patch to the deepseek-harness checkout. The previous host-patch implementation lives in [`legacy-client/`](legacy-client/) for reference only.

## What it solves

Skills are `SKILL.md` files (Markdown + YAML frontmatter) scattered across project, user, and `.agents` roots. Once you have more than a handful:

- you cannot see which ones actually resolve, or which ones are shadowed by a same-named skill;
- you cannot temporarily switch one off without editing or deleting files;
- there is no grouping, so everything is one flat list;
- frequently used rules must be retyped as `/name` in every new conversation.

## Features

| Capability | Detail |
| --- | --- |
| **Enable / disable** | One switch per skill. Disabling is a registry policy override — **source files are never touched**, it is instantly reversible, and uninstalling the plugin restores the original state. |
| **Default load** | Skills marked as default have their body injected into every new session's system prompt (`skill-manager:default-loaded` section). |
| **Categories** | Create, rename, delete categories, with optional extra keywords; one skill may belong to several; live member counts. |
| **Smart classification** | One click files unclassified skills by keyword rules. Local, explainable (shows the matched keyword), no API key. Six default categories are created on first use. |
| **Clipboard import** | Paste a `SKILL.md` (frontmatter optional) and it becomes a skill; the name comes from `name:`, the first H1, or is slugified. |
| **Load into this conversation** | Copies `/name` to the clipboard — **nothing is ever sent automatically**. |
| **Edit SKILL.md** | Create, edit, delete from the panel; kebab-case validation, never overwrites an existing skill, preserves unmanaged frontmatter keys. |
| **Shadow reporting** | Flags skills hidden by a higher-ranked root, so "I changed it but nothing happened" has an answer. |

## Install

```powershell
dsh plugin --profile desktop add link:D:\deepseek-harness\dsh-skill-manager

# or pack first
npm pack
dsh plugin --profile desktop add .\dsh-skill-manager-0.2.0.tgz
```

Restart the DeepSeek Harness app (host plugins load at startup), then refresh the page. The panel appears under Settings → **技能**.

Remove with `dsh plugin --profile desktop remove dsh-skill-manager`.

## How it works

- **Host half** (`lib/`): registers a **rank 0 override provider** on `ctx.skills` that only emits candidates for explicitly disabled skills, so it wins the same-name resolution against the filesystem provider (rank 100–600) — that is how "off without touching files" works. Because agent presets mount `dsh-skill-filesystem` again in their own layer, the provider is registered once on the host and once per `agent/created` scope. Default loading is a `systemPrompt.section` at order 7000. The HTTP endpoints live under the official `/api` channel via `connection.fetch.register`, so Host/Origin fencing and browser-session auth stay with the host.
- **Browser half** (`client/src/client/`): registers a `settings.section` slot and talks only to those `/api` routes. It is bundled into `window.__ModuleLoader__.load({ id, factory })` form and depends on `react` alone.
- **State**: `$DSH_HOME/skill-manager/preferences.json` — explicit user decisions only, no cached disk-derived data.

## Configuration

```yaml
- id: dsh-skill-manager
  name: dsh-skill-manager
  config:
    customSkillDirs: ['D:/shared-skills']
    log: false
```

| Field | Default | Meaning |
| --- | --- | --- |
| `includeDefaultRoots` | `true` | Include project and user roots |
| `customSkillDirs` | `[]` | Extra roots at rank 300 |
| `bundledSkillDir` | `$DSH_BUNDLED_SKILL_DIR` | Read-only root at rank 600 |
| `dshHome` / `agentsHome` | `$DSH_HOME` / `$DSH_AGENTS_HOME` | Root resolution base |
| `log` | `true` | Append to `$DSH_HOME/skill-manager/skill-manager.log` |

## Development

```sh
npm install
npm run build              # esbuild → client/client.js
node test/host.test.mjs    # catalog / store / classify / operations
node test/plugin.test.mjs  # apply() wiring and every /api endpoint via a fake cordis context
```

`npm test` (`node --test test/`) spawns a child test runner, which some confined environments block; run the files directly there.

## Known limits

- Default loading is a **global** prompt section: every session gets it. Per-project or per-agent scoping is not implemented yet.
- Only the DSH skill roots that `dsh-skill-filesystem` reads are managed; Claude/Cursor/Codex directories are deliberately not merged in.
- Deletion is permanent (no trash); the panel asks for confirmation.

## License

MIT. The prior implementation in `legacy-client/` is kept for reference; the approach was informed by publicly available community plugins (@lolkda/dsh-skills-manager, @wulongxi/dsh-skills-hub).
