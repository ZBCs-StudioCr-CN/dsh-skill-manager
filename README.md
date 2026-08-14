# dsh-skill-manager

A sidebar **Skill manager** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI: browse, create, edit, and delete **user-owned** SKILL.md files — with a full host-side CRUD RPC chain (`skill.create / skill.read / skill.update / skill.delete`).

[English](README.md) | [中文](README.zh.md)

---

## What it does

The harness loads agent skills from SKILL.md files (Markdown with YAML frontmatter) discovered under project and user roots. Until now there was **no way to author them from the GUI** — only the read-only `skill.list` RPC existed. This project adds the missing management surface:

- A **sidebar button** ("Skill 管理" / "Skills") next to Settings that opens a **panel** listing every user-invocable skill.
- Each row shows the skill name, description, and an **editable / read-only** badge (only user-owned skills are writable).
- **Create**: in-panel form with name, description, when-to-use, model/user invocation toggles, and the Markdown body.
- **Edit**: load the full frontmatter + body of a user-owned skill, change it, save.
- **Delete**: confirmation-then-remove, with the host catalog refreshed afterwards.

Writes land in the host's **user skills root** (`$DSH_HOME/skills/<name>/SKILL.md`) — never in a project or bundled root — and synchronously invalidate the skill catalog, so the model-facing `/name` invocation surface reflects changes on the next read.

## Features

| Area | Capability |
| --- | --- |
| UI | `sidebar.footer.action` panel (same seat as the Cordis panel), wide/rail layouts, zh/en copy |
| Host authoring | `createSkill` / `readSkill` / `updateSkill` / `removeSkill` in a new `skill-filesystem` writer, confined to the user-dsh root |
| Wire | `skill.create`, `skill.read`, `skill.update`, `skill.delete` RPCs through the full apiproxy stack (contract → schema → handler → client) |
| Safety | kebab-case name validation (a name is a directory name), never-overwrite create, readable not-found/conflict/read-only errors, privileged methods pinned to loopback |
| Registry | `SkillProvider.mutate` optional capability + `SkillRegistry.mutator()` host accessor; `skills/change` invalidation after every write |

## Screenshot

> TODO: add a screenshot of the sidebar button and the open panel.

## Repository layout

```
dsh-skill-manager/
├── client/                     # Standalone client plugin package @deepseek-ai/dsh-client-ui-skill-manager
│   ├── src/client/             #   browser half: panel component, slot face, locales
│   ├── src/index.ts            #   empty node half (pure UI plugin)
│   ├── src/invariant.ts        #   package-owned invariant companion
│   ├── tests/                  #   browser-plugin spec (jsdom)
│   ├── package.json            #   dsh.client manifest, peer/dev deps
│   └── tsdown.config.ts        #   client bundle entry
├── host/                       # Host-side integration for a DeepSeek Harness checkout
│   ├── 0001-skill-manager-host.patch   # complete git patch (29 files) — apply with `git apply`
│   └── README.md               #   what the patch changes, file by file
├── docs/
│   └── INSTALL.md              # detailed installation guide (three routes)
├── examples/
│   └── cordis.patch.yml        # bundle row to add to a web-app profile
├── LICENSE                     # MIT
└── README.md / README.zh.md
```

## Quick start

The feature has two halves: a **host CRUD capability** (the RPCs + skill-filesystem writer) and a **client panel** (this repo's `client/` package). The client package depends on the host RPCs, so install the host patch first, then enable the plugin.

```sh
# 1. In your deepseek-harness checkout, apply the host patch
cd deepseek-harness
git apply /path/to/dsh-skill-manager/host/0001-skill-manager-host.patch

# 2. Bring the new package into the workspace (add the dependency + tsconfig references,
#    or copy client/ into packages/client/ui-skill-manager — see docs/INSTALL.md)

# 3. Rebuild the client bundle and run the GUI dev server
pnpm install
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
pnpm run dev:web   # restart it after adding the package (plugin discovery runs once at startup)
```

Then open the web GUI: the **Skills** button appears in the sidebar above Settings.

> The exact integration steps depend on how your checkout is composed (monorepo workspace vs. standalone profile bundle). See [docs/INSTALL.md](docs/INSTALL.md) for the three supported routes.

## How it works

**Host side** (`host/0001-skill-manager-host.patch`):

- `@deepseek-ai/dsh-skill` — `SkillProvider` gains an optional `mutate?: SkillProviderMutate` capability; `SkillRegistry` exposes `mutator()` to reach the one writable provider.
- `@deepseek-ai/dsh-skill-filesystem` — new `writer.ts` implements create/read/update/delete against the user-dsh root, with `writeFileAtomic` writes, kebab-case name guards, existence checks, and `control.invalidate()` after every mutation.
- `@deepseek-ai/dsh-host-apiproxy` — `SkillsApi` gains `read/create/update/delete`; `rpc-map.ts`, `skills.schema.ts`, `fetch/handler.ts`, `fetch/client.ts`, and `api-proxy.ts` thread them end to end. `skill.list` also gains an `editable` field. New wire error codes: `skill-not-found`, `skill-conflict`, `skill-read-only`.
- `@deepseek-ai/dsh-client-connection` — browser types, the fixture implementation, and the loopback `PRIVILEGED_METHODS` fence are extended.
- The client slot catalog and the web-app bundle row are regenerated/registered.

**Client side** (`client/`):

- `src/client/index.ts` registers into `sidebar.footer.action` via `ctx.slots.inject(... register({ name, id: 'skill-manager', locale, inject }, SkillManagerPanel))`, exactly like the Cordis panel.
- The injected face calls `ctx.get('connection').api.skills.*` addressed by the current session id — the panel component never touches ctx or the RPC client.
- Locale dictionaries (zh/en) live in `src/client/locales.ts`.

## Development

```sh
# in client/
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle   # build lib/client.js
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager watch     # watch mode
pnpm exec vitest run packages/client/ui-skill-manager            # browser spec
```

## Tests

- `client/tests/browser-plugin.client.spec.tsx` — dictionary registration, panel list/editable gating, create form wiring (5 tests).
- Host: `skill-filesystem-writer.spec.ts` (6 tests), plus apiproxy schema/carrier/handler suites covering the new RPC rows.

## License

[MIT](LICENSE)
