# @deepseek-ai/dsh-client-ui-skill-manager

English | [中文](README.zh.md)

> **Build context**: this is a DeepSeek Harness plugin package — it builds inside
> the harness monorepo (`packages/client/ui-skill-manager`), where the shared
> tsdown preset and platform module table live. The commands below run from a
> `deepseek-harness` checkout that includes this package (see the repo-root
> `docs/INSTALL.md`, Route A).

Sidebar skill manager panel for the DeepSeek Harness web GUI: list, create,
edit, and delete **user-owned** SKILL.md files. It is the companion UI to the
host skill authoring capability (`skill.create / skill.read / skill.update /
skill.delete` RPCs on `@deepseek-ai/dsh-host-apiproxy`), which it drives through
the browser wire client.

## What it is

- A browser-only Cordis plugin (`platform: "web"`). The node half is an empty
  `apply()` so the package appears in the host Loader; all behavior rides the
  `./client` export discovered through the `dsh.client` manifest.
- Registers into the `sidebar.footer.action` slot (declared by
  `@deepseek-ai/dsh-client-ui-sidebar`), mirroring how `ui-cordis` places its
  panel beside Settings. The trigger is a badge button that expands a fixed
  panel listing skills; each row offers Edit/Delete for user-owned skills, an
  in-panel New form authoring a new skill, and a delete confirmation.
- Authoring verbs call the wire skill RPCs through the connection API client
  (`ctx.get('connection').api.skills`), addressed by the current
  session id. Writes land in the host's **user skills root**
  (`$DSH_HOME/skills/<name>/SKILL.md`) — never in a project or bundled root —
  and synchronously invalidate the host skill catalog.

## Model experience

The panel is a user-management surface. It does not touch the model's runtime
catalog itself: the host's filesystem provider re-reads the user skills root on
the next `skill.list`, so a created/edited/deleted skill is reflected in the
model-facing catalog (and the `/name` invocation surface) on the next read. The
plugin adds no prompt text, no tokens, and no KV-cache entries of its own.

## Development

Bundle and watch:

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager watch
pnpm run dev:web   # live GUI at http://127.0.0.1:3080 (restart after adding the package)
```

Run the browser spec:

```sh
pnpm vitest run packages/client/ui-skill-manager
```

## Known Limitations and Deferred Work

- **User-owned skills only** — the panel manages skills under the host's
  `$DSH_HOME/skills` root. Project (`.dsh/skills`, `.agents/skills`) and
  bundled skills are listed read-only (no edit/delete actions); authoring them
  from the GUI is deliberately unsupported so a repository or deployment is
  never silently rewritten.
- **Requires the filesystem skill provider** — `skill.create/read/update/delete`
  need a registered provider with a user writable root (`dsh-skill-filesystem`).
  A deployment without one renders the panel with the verbs failing with a
  read-only code rather than a no-op success.
- **Rename is delete + create** — a name is the skill directory name, so
  renaming is not a single verb; the edit form locks the name field and the
  user deletes and recreates under the new name.
