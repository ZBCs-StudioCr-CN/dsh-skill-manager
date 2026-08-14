# Host-side integration

This directory contains everything needed to add the skill-manager **host capability** to a `deepseek-ai/deepseek-harness` checkout. The client panel (this repo's `client/`) depends on these RPCs, so apply this before enabling the plugin.

## `0001-skill-manager-host.patch`

A complete git patch (29 files, 1406 lines) generated with `git diff` from the reference implementation. It is byte-for-byte identical to the working tree it was produced from.

Apply:

```sh
cd deepseek-harness
git apply /path/to/dsh-skill-manager/host/0001-skill-manager-host.patch
# on a drifted checkout: git apply --3way, resolve the few hunks manually
```

## What the patch changes

| Package | File(s) | Change |
| --- | --- | --- |
| `@deepseek-ai/dsh-skill` | `src/index.ts` | `SkillProvider` gains optional `mutate?: SkillProviderMutate` (`create/read/update/remove`); new `SkillWriteInput` / `SkillWriteResult` types; `SkillRegistry.mutator()` host accessor (reads the global layer only). |
| `@deepseek-ai/dsh-skill-filesystem` | `src/writer.ts` (new), `src/index.ts`, `package.json`, `tsconfig.json` | New authoring module confined to the user-dsh root: `writeFileAtomic` create/update, `rm` remove, kebab-case name guard, existence checks, stable error codes (`skill-invalid-name/exists/not-found/not-writable`). Provider wires `mutate` and invalidates via `control.invalidate()` after each write. Adds `@deepseek-ai/dsh-atomic-write` dependency. |
| `@deepseek-ai/dsh-host-apiproxy` | `src/api/skills.ts`, `skills.schema.ts`, `rpc-map.ts`, `api/index.ts`, `api/rpc.ts`, `fetch/handler.ts`, `fetch/client.ts`, `api-proxy.ts` | `SkillsApi` gains `read/create/update/delete`; zod schemas `skill{Read,Create,Update,Delete}{Request,Value}Schema`; RPC map + unary routes + value schemas + `AbstractApiClient` rows; `api-proxy.ts` implements authoring via `resolveAuthoringRegistry` + `mutator()`, `skill.list` gains `editable`; new wire error codes `skill-not-found` / `skill-conflict` / `skill-read-only`. |
| `@deepseek-ai/dsh-client-connection` | `src/client/api.ts`, `src/client/index.ts`, `src/client/fixture.ts`, `src/index.ts` | Re-exports `SkillDetail` / `SkillWritePayload` / `SkillWriteResult`; fixture skills block implements CRUD over an in-memory store; `PRIVILEGED_METHODS` pins `skill.read/create/update/delete` to loopback. |
| `@deepseek-ai/dsh-api-remotes` | `src/client/index.ts` | Type re-exports for the browser. |
| `packages/extensions/cordis-client-runner` | `src/client/slot-catalog.ts` | Regenerated slot catalog (includes `sidebar.footer.action` entry for the new panel). |
| `packages/bundle/web-app` | `cordis.patch.yml`, `package.json` | Bundle row `ui-skill-manager` + dependency. |
| repo root | `tsconfig.base.json`, `tsconfig.client.json` | Path mapping + project reference for the new package. |
| tests | `apiproxy/tests/{client-handler,fetch-carrier,rpc-schemas}.spec.ts`, `connection/tests/fake-api.client.ts`, `runtime/tests/fake-api.client.ts`, `skill-filesystem/tests/skill-filesystem-writer.spec.ts` (new) | Contract/carrier/handler coverage for the new RPCs, fake API slots, and the writer. |

## Client package

The `client/` directory at the repo root is the standalone source of `@deepseek-ai/dsh-client-ui-skill-manager` — see the root README and `docs/INSTALL.md`. It is deliberately **not** part of the patch (the patch's `cordis.patch.yml` / tsconfig rows reference it by path).
