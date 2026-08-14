# Installation Guide

The skill manager has two halves that must both be present:

1. **Host CRUD capability** — `skill.create / skill.read / skill.update / skill.delete` RPCs plus the skill-filesystem writer. Delivered as `host/0001-skill-manager-host.patch` against a `deepseek-harness` checkout.
2. **Client panel** — the `client/` plugin package (`@deepseek-ai/dsh-client-ui-skill-manager`).

This guide covers three routes. Pick the one that matches how your harness is composed.

---

## Route A — Monorepo workspace integration (recommended)

If you run the harness from a git checkout of `deepseek-ai/deepseek-harness`, apply the patch and wire the package into the workspace.

```sh
# 1. Apply the host patch
cd deepseek-harness
git apply /path/to/dsh-skill-manager/host/0001-skill-manager-host.patch
git status   # review: 29 files changed, no conflicts expected on a clean master

# 2. Install the client package into the monorepo
#    Either copy it in:
cp -r /path/to/dsh-skill-manager/client packages/client/ui-skill-manager
#    Or, if you keep it as a separate package, add it to pnpm-workspace.yaml / workspaces
#    and declare the dependency in packages/bundle/web-app/package.json:
#      "@deepseek-ai/dsh-client-ui-skill-manager": "workspace:^",

# 3. Register the bundle row and typecheck aggregate
#    - packages/bundle/web-app/cordis.patch.yml: add
#        - id: ui-skill-manager
#          name: '@deepseek-ai/dsh-client-ui-skill-manager'
#    - tsconfig.base.json:     add the path mapping (see the patch; already included if applied)
#    - tsconfig.client.json:   add the project reference (already included if applied)

# 4. Install, rebuild, run
pnpm install
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
pnpm run dev:web   # restart after adding the package — plugin discovery runs once at startup
```

Open the web GUI at http://127.0.0.1:3080 — the **Skills** button appears in the sidebar above Settings.

> The patch already includes the `tsconfig.base.json`, `tsconfig.client.json`, `cordis.patch.yml`, and `web-app/package.json` rows, so steps 2–3 collapse to "copy `client/` in" when your checkout matches the patch base.

---

## Route B — Standalone profile bundle (no full workspace)

If your harness boots from a cordis profile (the `dsh --profile` flow), you can ship the feature as a bundle:

1. Copy the client package to a location your bundle resolver reaches (e.g. `$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-client-ui-skill-manager`, or keep it as a workspace package your bundle depends on).
2. Apply the host patch to the harness source your profile runs (the RPCs are compiled in; a patch is required until the feature lands upstream).
3. Add the bundle row from `examples/cordis.patch.yml` to your web-app profile's `cordis.patch.yml`:

```yaml
- id: ui-skill-manager
  name: '@deepseek-ai/dsh-client-ui-skill-manager'
```

4. Build the client bundle (`pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle`) and restart the GUI.

> The bundle row is what the modules node-half scans into `window.__DSH_BOOT__`; without it the shell never fetches the panel.

---

## Route C — Host already has the RPCs (client only)

If your harness build already includes the `skill.*` CRUD RPCs (e.g. the feature merged upstream, or you applied the patch previously), you only need the client panel:

```sh
# Register the package as a web platform plugin (dsh.client manifest is already in client/package.json)
pnpm --filter @deepseek-ai/dsh-client-ui-skill-manager bundle
# Add the bundle row to your web-app profile (examples/cordis.patch.yml)
# Restart dev:web / the GUI server
```

---

## Verification

After installing, run the test suites to confirm both halves work:

```sh
# Host writer + RPC contract
pnpm exec vitest run packages/skill/skill-filesystem/tests/skill-filesystem-writer.spec.ts
pnpm exec vitest run packages/host/apiproxy/tests/rpc-schemas.spec.ts packages/host/apiproxy/tests/fetch-carrier.spec.ts

# Client panel
pnpm exec vitest run packages/client/ui-skill-manager
```

Manual check: open the panel, create a skill named `hello-manager`, confirm `$DSH_HOME/skills/hello-manager/SKILL.md` exists with your frontmatter + body, then delete it and confirm the row disappears.

---

## Troubleshooting

- **Panel missing after adding the package** — plugin discovery runs once at GUI-server startup. Restart `pnpm run dev:web` (or the `dsh web` server).
- **Verbs fail with a read-only error** — no user-writable skill root is mounted. Ensure `@deepseek-ai/dsh-skill-filesystem` is composed and `$DSH_HOME` is set.
- **`git apply` rejects the patch** — your checkout drifted from the patch base (e.g. other changes touched the same files). Apply file-by-file with `git apply --3way` and resolve the few hunks manually; the changes are additive.
- **Project / bundled skills show read-only** — by design. Only `$DSH_HOME/skills` (user-dsh) is writable from the panel.
