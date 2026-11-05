# 安装

0.2.0 起本插件是**可独立安装的 bundle**，不再需要给 deepseek-harness 打宿主补丁。安装方式见根目录 [README.zh.md](../README.zh.md#安装)：

```powershell
dsh plugin --profile desktop add link:D:\deepseek-harness\dsh-skill-manager
# 或
npm pack
dsh plugin --profile desktop add .\dsh-skill-manager-0.2.0.tgz
```

安装后重启 DeepSeek Harness 应用（宿主插件在启动时加载），再刷新页面。

旧的「宿主补丁 + monorepo 客户端包」安装方式已废弃，对应实现留在 [`legacy-client/`](../legacy-client/)，仅作历史参考：

- `legacy-client/package.json` —— 当时的 `@deepseek-ai/dsh-client-ui-skill-manager` 包定义
- `host/0001-skill-manager-host.patch` —— 针对 deepseek-harness 0.1.0-rc.5 的宿主补丁
