/**
 * Skill manager plugin, node half. Pure UI plugin: the empty apply
 * exists so the plugin appears in the host cordis.yml / Loader; the browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration. Dispatches skill create/edit/delete RPCs host-side.
 */

/** Host plugin body — no host-side behavior for this UI-only plugin. */
export function apply(): void {}
