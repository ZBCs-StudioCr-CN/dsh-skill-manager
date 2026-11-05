/* 生成文件：不要直接编辑，改 client/src/client/*.ts(x) 后运行 npm run build。 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-manager',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    ;(function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// client/src/client/panel.tsx
var React = __toESM(require("react"), 1);
var import_react = require("react");

// client/src/client/api.ts
var ROUTE = "/api/dsh-skill-manager";
var pinnedCwd = null;
function setCwd(cwd) {
  pinnedCwd = cwd;
}
async function request(path, body) {
  const query = pinnedCwd ? `${path.includes("?") ? "&" : "?"}cwd=${encodeURIComponent(pinnedCwd)}` : "";
  const response = await fetch(`${ROUTE}${path}${query}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: body === void 0 ? void 0 : { "content-type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!payload) {
    if (response.status === 401) throw new Error("浏览器会话未通过鉴权（HTTP 401）：请从 DSH 界面打开并刷新");
    if (response.status === 403) throw new Error("宿主拒绝了本次请求（HTTP 403）：当前访问的主机不在受信列表");
    throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (payload.ok === false) throw new Error(payload.error ?? "宿主返回了错误");
  return payload;
}
var api = {
  catalog: () => request("/catalog"),
  registry: () => request("/registry"),
  savePreferences: (preferences) => request("/preferences", { preferences }),
  classify: (categories) => request("/classify", { categories: [...categories] }),
  read: (name2, rootKey) => request(`/skill?name=${encodeURIComponent(name2)}&rootKey=${encodeURIComponent(rootKey)}`),
  create: (body) => request("/skill/create", body),
  save: (body) => request("/skill/save", body),
  remove: (name2, rootKey) => request("/skill/delete", { name: name2, rootKey }),
  importText: (text, rootKey) => request("/skill/import", { text, rootKey }),
  open: (rootKey) => request(`/open?rootKey=${encodeURIComponent(rootKey ?? "")}`)
};

// client/src/client/panel.tsx
var EMPTY_PREFERENCES = { disabled: [], defaultLoaded: [], categories: [] };
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
function categoryId(name2) {
  const id = name2.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return id || `category-${Date.now().toString(36)}`;
}
function Panel(props) {
  const [data, setData] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)();
  const [notice, setNotice] = (0, import_react.useState)();
  const [query, setQuery] = (0, import_react.useState)("");
  const [filter, setFilter] = (0, import_react.useState)("all");
  const [editing, setEditing] = (0, import_react.useState)();
  const [importText, setImportText] = (0, import_react.useState)();
  const [importRoot, setImportRoot] = (0, import_react.useState)();
  const [managing, setManaging] = (0, import_react.useState)(false);
  const [confirmDelete, setConfirmDelete] = (0, import_react.useState)();
  const [busy, setBusy] = (0, import_react.useState)();
  const preferences = data?.preferences ?? EMPTY_PREFERENCES;
  const reload = (0, import_react.useCallback)(async () => {
    try {
      const payload = await api.catalog();
      setData(payload);
      setError(void 0);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void reload();
  }, [reload]);
  const currentSession = props?.useSessions ? props.useSessions((state) => state?.current) : void 0;
  (0, import_react.useEffect)(() => {
    if (!currentSession) return;
    const cwd = currentSession?.header?.cwd ?? currentSession?.cwd;
    if (typeof cwd === "string" && cwd.trim()) {
      setCwd(cwd);
      void reload();
    }
  }, [currentSession, reload]);
  const persist = (0, import_react.useCallback)(
    async (next, message) => {
      try {
        await api.savePreferences(next);
        await reload();
        if (message) setNotice(message);
        setError(void 0);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    },
    [reload]
  );
  const toggleEnabled = async (skill) => {
    const disabled = new Set(preferences.disabled);
    if (disabled.has(skill.name)) disabled.delete(skill.name);
    else disabled.add(skill.name);
    await persist({ ...preferences, disabled: [...disabled] }, disabled.has(skill.name) ? `已停用 ${skill.name}` : `已启用 ${skill.name}`);
  };
  const toggleDefault = async (skill) => {
    const defaults = new Set(preferences.defaultLoaded);
    if (defaults.has(skill.name)) defaults.delete(skill.name);
    else defaults.add(skill.name);
    await persist({ ...preferences, defaultLoaded: [...defaults] }, defaults.has(skill.name) ? `${skill.name} 将在每个新对话默认加载` : `已取消 ${skill.name} 的默认加载`);
  };
  const loadIntoConversation = async (skill) => {
    const ok = await copyText(`/${skill.name} `);
    setNotice(ok ? `已复制 /${skill.name}，粘贴到输入框回车即可带入本次对话` : "复制失败：浏览器拒绝了剪贴板写入");
  };
  const runClassify = async () => {
    setBusy("classify");
    try {
      const { suggestions } = await api.classify(preferences.categories);
      const accepted = suggestions.filter((item) => item.categoryId);
      if (accepted.length === 0) {
        setNotice("没有找到新的可归类技能");
        return;
      }
      const categories = (preferences.categories.length > 0 ? preferences.categories : defaultCategories()).map((category) => ({
        ...category,
        skills: [.../* @__PURE__ */ new Set([...category.skills, ...accepted.filter((item) => item.categoryId === category.id).map((item) => item.skill)])]
      }));
      await persist({ ...preferences, categories }, `已按关键词归类 ${accepted.length} 个技能`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(void 0);
    }
  };
  const addCategory = async () => {
    const id = categoryId("新分类");
    const categories = [...preferences.categories, { id, name: "新分类", keywords: [], skills: [] }];
    await persist({ ...preferences, categories }, "已新增分类，记得改名");
  };
  const updateCategory = async (next) => {
    const categories = preferences.categories.map((category) => category.id === next.id ? next : category);
    await persist({ ...preferences, categories });
  };
  const removeCategory = async (id) => {
    await persist({ ...preferences, categories: preferences.categories.filter((category) => category.id !== id) }, "已删除分类");
  };
  const submitEditing = async () => {
    if (!editing) return;
    const name2 = editing.name.trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name2)) {
      setError("技能名必须是 kebab-case：小写字母、数字、连字符");
      return;
    }
    setBusy("save");
    try {
      const body = {
        name: name2,
        rootKey: editing.rootKey,
        description: editing.description,
        whenToUse: editing.whenToUse,
        body: editing.body,
        disableModelInvocation: editing.disableModelInvocation,
        userInvocable: editing.userInvocable
      };
      if (editing.mode === "new") await api.create(body);
      else await api.save(body);
      const categories = preferences.categories.map((category) => ({
        ...category,
        skills: editing.categoryIds.includes(category.id) ? [.../* @__PURE__ */ new Set([...category.skills, name2])] : category.skills.filter((item) => item !== name2)
      }));
      await persist({ ...preferences, categories }, editing.mode === "new" ? `已新建 ${name2}` : `已保存 ${name2}`);
      setEditing(void 0);
      setError(void 0);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(void 0);
    }
  };
  const beginEdit = async (skill) => {
    try {
      const { content } = await api.read(skill.name, skill.rootKey);
      const { body, description, whenToUse, disableModelInvocation, userInvocable } = splitContent(content, skill);
      setEditing({
        mode: "edit",
        name: skill.name,
        description,
        whenToUse,
        body,
        disableModelInvocation,
        userInvocable,
        categoryIds: skill.categoryIds,
        rootKey: skill.rootKey
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const removeSkill = async (skill) => {
    setBusy(skill.name);
    try {
      await api.remove(skill.name, skill.rootKey);
      setConfirmDelete(void 0);
      await reload();
      setNotice(`已删除 ${skill.name}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(void 0);
    }
  };
  const importFromClipboard = async () => {
    const text = await readClipboard();
    setImportText(text ?? "");
    setImportRoot(data?.roots.find((root) => !root.readOnly)?.key);
  };
  const submitImport = async () => {
    if (!importText?.trim()) {
      setError("剪贴板内容为空，先复制一段 SKILL.md 再试");
      return;
    }
    setBusy("import");
    try {
      const result = await api.importText(importText, importRoot);
      setImportText(void 0);
      await reload();
      setNotice(`已导入 ${result.name}`);
      setError(void 0);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(void 0);
    }
  };
  const skills = data?.skills ?? [];
  const filtered = (0, import_react.useMemo)(() => {
    const needle = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (needle && !`${skill.name} ${skill.description} ${skill.whenToUse}`.toLowerCase().includes(needle)) return false;
      if (filter === "all") return true;
      if (filter === "uncategorized") return skill.categoryIds.length === 0;
      return skill.categoryIds.includes(filter);
    });
  }, [skills, query, filter]);
  const countOf = (id) => skills.filter((skill) => skill.categoryIds.includes(id)).length;
  const writableRoot = data?.roots.find((root) => !root.readOnly);
  return /* @__PURE__ */ React.createElement("section", { className: "skm-section" }, /* @__PURE__ */ React.createElement("header", { className: "skm-head" }, /* @__PURE__ */ React.createElement("div", { className: "skm-head__text" }, /* @__PURE__ */ React.createElement("h3", { className: "skm-title" }, "技能管理"), /* @__PURE__ */ React.createElement("p", { className: "skm-sub" }, skills.length, " 个技能 · 根目录 ", data?.skillRoot ?? "未解析", " · 启用状态与分类保存在 ", data?.preferencesPath ?? "…")), /* @__PURE__ */ React.createElement("div", { className: "skm-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => void reload(), disabled: busy !== void 0 }, "刷新"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => void runClassify(), disabled: busy !== void 0 || skills.length === 0 }, busy === "classify" ? "归类中…" : "智能归类"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => void importFromClipboard() }, "从剪贴板导入"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "skm-btn skm-btn--primary",
      onClick: () => setEditing({
        mode: "new",
        name: "",
        description: "",
        whenToUse: "",
        body: "",
        disableModelInvocation: false,
        userInvocable: false,
        categoryIds: [],
        rootKey: writableRoot?.key ?? "user-dsh"
      })
    },
    "新建技能"
  ))), error ? /* @__PURE__ */ React.createElement("p", { className: "skm-notice skm-notice--error" }, "⚠ ", error) : null, notice ? /* @__PURE__ */ React.createElement("p", { className: "skm-notice" }, notice) : null, /* @__PURE__ */ React.createElement("div", { className: "skm-actions" }, /* @__PURE__ */ React.createElement("input", { className: "skm-search", placeholder: "搜索技能名或描述", value: query, onChange: (event) => setQuery(event.target.value) }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost", onClick: () => void api.open(writableRoot?.key).then((result) => setNotice(result.opened ? `已打开 ${result.path}` : `目录：${result.path}`)) }, "打开文件夹"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost", onClick: () => setManaging(!managing) }, managing ? "收起分类管理" : "管理分类")), /* @__PURE__ */ React.createElement("div", { className: "skm-chips" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: `skm-chip${filter === "all" ? " skm-chip--active" : ""}`, onClick: () => setFilter("all") }, "全部 ", /* @__PURE__ */ React.createElement("span", { className: "skm-chip__count" }, skills.length)), /* @__PURE__ */ React.createElement("button", { type: "button", className: `skm-chip${filter === "uncategorized" ? " skm-chip--active" : ""}`, onClick: () => setFilter("uncategorized") }, "未归类 ", /* @__PURE__ */ React.createElement("span", { className: "skm-chip__count" }, skills.filter((skill) => skill.categoryIds.length === 0).length)), preferences.categories.map((category) => /* @__PURE__ */ React.createElement("button", { type: "button", key: category.id, className: `skm-chip${filter === category.id ? " skm-chip--active" : ""}`, onClick: () => setFilter(category.id) }, category.name, " ", /* @__PURE__ */ React.createElement("span", { className: "skm-chip__count" }, countOf(category.id))))), managing ? /* @__PURE__ */ React.createElement("div", { className: "skm-card" }, /* @__PURE__ */ React.createElement("h4", { className: "skm-card__title" }, "分类管理"), /* @__PURE__ */ React.createElement("div", { className: "skm-cats" }, preferences.categories.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "skm-notice" }, "还没有分类。点「智能归类」会自动建立默认分类，也可以手动新增。") : null, preferences.categories.map((category) => /* @__PURE__ */ React.createElement("div", { className: "skm-cat", key: category.id }, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "skm-input",
      style: { maxWidth: 160 },
      value: category.name,
      onChange: (event) => void updateCategory({ ...category, name: event.target.value })
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "skm-input",
      style: { flex: "1 1 240px" },
      placeholder: "额外关键词，用逗号分隔",
      value: category.keywords.join(", "),
      onChange: (event) => void updateCategory({ ...category, keywords: event.target.value.split(",").map((word) => word.trim()).filter(Boolean) })
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "skm-cat__meta" }, category.skills.length, " 个技能"), /* @__PURE__ */ React.createElement("span", { className: "skm-spacer" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--danger", onClick: () => void removeCategory(category.id) }, "删除")))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => void addCategory() }, "新增分类"))) : null, editing ? /* @__PURE__ */ React.createElement("div", { className: "skm-card" }, /* @__PURE__ */ React.createElement("h4", { className: "skm-card__title" }, editing.mode === "new" ? "新建技能" : `编辑 ${editing.name}`), /* @__PURE__ */ React.createElement("div", { className: "skm-grid" }, /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "技能名（kebab-case）", /* @__PURE__ */ React.createElement("input", { className: "skm-input", value: editing.name, disabled: editing.mode === "edit", onChange: (event) => setEditing({ ...editing, name: event.target.value }) })), /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "写入位置", /* @__PURE__ */ React.createElement("select", { className: "skm-input", value: editing.rootKey, onChange: (event) => setEditing({ ...editing, rootKey: event.target.value }) }, (data?.roots ?? []).filter((root) => !root.readOnly).map((root) => /* @__PURE__ */ React.createElement("option", { key: root.key, value: root.key }, root.source, " · ", root.path))))), /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "一句话描述（用于路由）", /* @__PURE__ */ React.createElement("input", { className: "skm-input", value: editing.description, onChange: (event) => setEditing({ ...editing, description: event.target.value }) })), /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "何时使用（可选）", /* @__PURE__ */ React.createElement("input", { className: "skm-input", value: editing.whenToUse, onChange: (event) => setEditing({ ...editing, whenToUse: event.target.value }) })), /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "正文（SKILL.md 的 Markdown 部分）", /* @__PURE__ */ React.createElement("textarea", { className: "skm-textarea", value: editing.body, onChange: (event) => setEditing({ ...editing, body: event.target.value }) })), /* @__PURE__ */ React.createElement("div", { className: "skm-chips" }, /* @__PURE__ */ React.createElement("span", { className: "skm-field", style: { flexDirection: "row", alignItems: "center" } }, "归属分类："), preferences.categories.map((category) => /* @__PURE__ */ React.createElement("label", { className: "skm-check", key: category.id }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: editing.categoryIds.includes(category.id),
      onChange: (event) => setEditing({
        ...editing,
        categoryIds: event.target.checked ? [...editing.categoryIds, category.id] : editing.categoryIds.filter((id) => id !== category.id)
      })
    }
  ), category.name))), /* @__PURE__ */ React.createElement("div", { className: "skm-chips" }, /* @__PURE__ */ React.createElement("label", { className: "skm-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: editing.disableModelInvocation, onChange: (event) => setEditing({ ...editing, disableModelInvocation: event.target.checked }) }), "模型不可自动调用（disable-model-invocation）"), /* @__PURE__ */ React.createElement("label", { className: "skm-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: editing.userInvocable, onChange: (event) => setEditing({ ...editing, userInvocable: event.target.checked }) }), "允许用户用 /name 调用")), /* @__PURE__ */ React.createElement("div", { className: "skm-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--primary", onClick: () => void submitEditing(), disabled: busy !== void 0 }, busy === "save" ? "保存中…" : "保存"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => setEditing(void 0) }, "取消"))) : null, importText !== void 0 ? /* @__PURE__ */ React.createElement("div", { className: "skm-card" }, /* @__PURE__ */ React.createElement("h4", { className: "skm-card__title" }, "从剪贴板导入"), /* @__PURE__ */ React.createElement("p", { className: "skm-notice" }, "粘贴一段 SKILL.md（可带 frontmatter）。技能名取 frontmatter 的 name、第一个一级标题，或自动转写。"), /* @__PURE__ */ React.createElement("textarea", { className: "skm-textarea", placeholder: "---\nname: my-skill\ndescription: 这个技能做什么\n---\n\n# 正文标题\n\n规则…", value: importText, onChange: (event) => setImportText(event.target.value) }), /* @__PURE__ */ React.createElement("label", { className: "skm-field" }, "导入到", /* @__PURE__ */ React.createElement("select", { className: "skm-input", value: importRoot, onChange: (event) => setImportRoot(event.target.value) }, (data?.roots ?? []).filter((root) => !root.readOnly).map((root) => /* @__PURE__ */ React.createElement("option", { key: root.key, value: root.key }, root.source, " · ", root.path)))), /* @__PURE__ */ React.createElement("div", { className: "skm-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: async () => setImportText(await readClipboard() ?? "") }, "重新读取剪贴板"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--primary", onClick: () => void submitImport(), disabled: busy !== void 0 }, busy === "import" ? "导入中…" : "导入"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => setImportText(void 0) }, "取消"))) : null, /* @__PURE__ */ React.createElement("div", { className: "skm-list" }, filtered.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "skm-empty" }, skills.length === 0 ? "还没有技能。新建一个，或从剪贴板导入。" : "没有符合筛选条件的技能。") : null, filtered.map((skill) => /* @__PURE__ */ React.createElement("div", { className: `skm-row${skill.enabled ? "" : " skm-row--off"}`, key: `${skill.rootKey}/${skill.name}` }, /* @__PURE__ */ React.createElement("div", { className: "skm-row__main" }, /* @__PURE__ */ React.createElement("div", { className: "skm-name" }, "/", skill.name), /* @__PURE__ */ React.createElement("div", { className: "skm-desc" }, skill.description || "（无描述）"), /* @__PURE__ */ React.createElement("div", { className: "skm-tags" }, /* @__PURE__ */ React.createElement("span", { className: "skm-tag" }, skill.source), skill.defaultLoaded ? /* @__PURE__ */ React.createElement("span", { className: "skm-tag skm-tag--cat" }, "默认加载") : null, skill.categoryIds.map((id) => {
    const category = preferences.categories.find((item) => item.id === id);
    return category ? /* @__PURE__ */ React.createElement("span", { className: "skm-tag", key: id }, category.name) : null;
  }), skill.readOnly ? /* @__PURE__ */ React.createElement("span", { className: "skm-tag skm-tag--warn" }, "只读") : null)), /* @__PURE__ */ React.createElement("div", { className: "skm-row__side" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost", onClick: () => void loadIntoConversation(skill) }, "载入对话"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost", disabled: skill.readOnly, onClick: () => void beginEdit(skill) }, "编辑"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost", onClick: () => void toggleDefault(skill), title: "新对话默认带上" }, skill.defaultLoaded ? "取消默认" : "设默认"), confirmDelete === skill.name ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--danger", disabled: busy === skill.name, onClick: () => void removeSkill(skill) }, "确认删除"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn", onClick: () => setConfirmDelete(void 0) }, "取消")) : /* @__PURE__ */ React.createElement("button", { type: "button", className: "skm-btn skm-btn--ghost skm-btn--danger", disabled: skill.readOnly, onClick: () => setConfirmDelete(skill.name) }, "删除"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: `skm-switch${skill.enabled ? " skm-switch--on" : ""}`,
      "aria-label": skill.enabled ? "停用" : "启用",
      title: skill.enabled ? "停用（不改源文件）" : "启用",
      onClick: () => void toggleEnabled(skill)
    },
    /* @__PURE__ */ React.createElement("span", { className: "skm-switch__knob" })
  ))))), data && data.shadowed.length > 0 ? /* @__PURE__ */ React.createElement("p", { className: "skm-notice" }, "另有 ", data.shadowed.length, " 个同名技能被更高优先级的根遮蔽（例如 ", data.shadowed[0].name, " 来自 ", data.shadowed[0].source, "）。") : null);
}
function splitContent(content, fallback) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
  if (!match) return { body: content.trim(), description: fallback.description, whenToUse: fallback.whenToUse, disableModelInvocation: false, userInvocable: false };
  const attributes = {};
  for (const line of match[1].split("\n")) {
    const item = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (item) attributes[item[1]] = item[2].trim().replace(/^["']|["']$/g, "");
  }
  return {
    body: match[2].replace(/^\n+/, "").trim(),
    description: attributes.description ?? fallback.description,
    whenToUse: attributes["when-to-use"] ?? fallback.whenToUse,
    disableModelInvocation: String(attributes["disable-model-invocation"] ?? "").toLowerCase() === "true",
    userInvocable: String(attributes["user-invocable"] ?? "").toLowerCase() === "true"
  };
}
async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return void 0;
  }
}
function defaultCategories() {
  return [
    { id: "design", name: "设计", keywords: ["设计", "ui", "ux", "界面"], skills: [] },
    { id: "competitor-analysis", name: "竞品分析", keywords: ["竞品", "对标"], skills: [] },
    { id: "market-analysis", name: "市场分析", keywords: ["市场", "获客", "增长"], skills: [] },
    { id: "planning", name: "项目规划", keywords: ["规划", "排期", "sprint"], skills: [] },
    { id: "development", name: "开发", keywords: ["开发", "代码", "api"], skills: [] },
    { id: "operations", name: "运营", keywords: ["运营", "日报", "回顾"], skills: [] }
  ];
}

// client/src/client/styles.ts
var CSS = `
.skm-section{max-width:820px;min-width:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.skm-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.skm-head__text{flex:1 1 320px;min-width:0}
.skm-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.skm-sub{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.skm-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.skm-btn{box-sizing:border-box;height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}
.skm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.skm-btn:disabled{color:var(--dsw-alias-label-quaternary);border-color:var(--dsw-alias-border-l4);cursor:default}
.skm-btn--primary{height:30px;padding:0 14px;border-radius:15px;border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.skm-btn--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.skm-btn--primary:disabled{background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-quaternary)}
.skm-btn--danger{color:var(--dsw-alias-state-error-primary)}
.skm-btn--danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.skm-btn--ghost{border-color:transparent}
.skm-search{box-sizing:border-box;flex:1 1 220px;min-width:160px;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:15px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.skm-search:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.skm-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.skm-chip{box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:13px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}
.skm-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.skm-chip--active{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.skm-chip__count{color:var(--dsw-alias-label-quaternary);font-size:11px}
.skm-list{display:flex;flex-direction:column;gap:8px;min-width:0}
.skm-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;min-width:0}
.skm-row--off{opacity:.64}
.skm-row__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.skm-name{font-size:14px;line-height:20px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.skm-desc{font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.skm-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.skm-tag{padding:0 6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.skm-tag--cat{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.skm-tag--warn{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.skm-row__side{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.skm-switch{position:relative;flex:0 0 auto;width:34px;height:19px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.skm-switch--on{background:var(--dsw-alias-label-primary)}
.skm-switch:disabled{opacity:.5;cursor:default}
.skm-switch__knob{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:left .15s ease}
.skm-switch--on .skm-switch__knob{left:17px}
.skm-card{display:flex;flex-direction:column;gap:12px;padding:14px;border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;background:var(--dsw-alias-bg-module-platform)}
.skm-card__title{margin:0;font-size:14px;line-height:20px;font-weight:600}
.skm-field{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);min-width:0}
.skm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.skm-input,.skm-textarea{box-sizing:border-box;width:100%;border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.skm-input{height:32px;padding:0 10px}
.skm-textarea{min-height:220px;padding:10px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:18px}
.skm-input:focus,.skm-textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.skm-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.skm-notice{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.skm-notice--error{color:var(--dsw-alias-state-error-primary)}
.skm-empty{margin:0;padding:16px;border:.5px dashed var(--dsw-alias-border-l3);border-radius:14px;text-align:center;font-size:13px;color:var(--dsw-alias-label-quaternary)}
.skm-cats{display:flex;flex-direction:column;gap:8px}
.skm-cat{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:12px}
.skm-cat__name{font-size:13px;font-weight:500}
.skm-cat__meta{font-size:11px;color:var(--dsw-alias-label-quaternary)}
.skm-spacer{flex:1 1 auto}
`;

// client/src/client/index.ts
var name = "dsh-skill-manager";
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-skill-manager";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "skill-manager: 样式");
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "dsh-skill-manager",
        order: 62,
        label: () => "技能",
        inject: () => ({})
      },
      Panel
    )
  );
}

    })(module, exports, require)
    return module.exports
  },
})
