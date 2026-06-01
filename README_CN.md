# Code Light AI

[English](./README.md)

一个为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 设计的系统托盘状态指示灯。它可以在系统托盘显示一个彩色指示图标，让你一眼就能看到 AI 编程助手正在做什么 —— 不需要一直盯着终端窗口。

## 状态指示灯

| 颜色 | 状态 | 说明 |
|:---:|---|---|
| 灰色 | 空闲 | 没有活跃的 Claude Code 会话 |
| 绿色（闪烁） | 工作中 | Agent 正在执行工具调用 |
| 黄色（闪烁） | 等待确认 | Agent 正在等待用户授权确认 |
| 红色（闪烁） | 出错 | 发生了错误 |
| 蓝色 | 已完成 | 任务完成（显示 10 秒后自动回到空闲状态） |

活跃状态（工作 / 等待 / 出错）每 500ms 闪烁一次，提醒你注意。托盘图标的提示文字会显示当前状态、活跃会话数和最后更新时间。

## 工作原理

Code Light 使用基于文件的轮询机制：

1. **Shell 脚本**作为 Claude Code 生命周期钩子注册（写入 `~/.claude/settings.json`）
2. 每个钩子将 JSON 状态文件写入 `~/.code-light/sessions/<会话ID>.json`
3. 托盘应用每秒轮询这些文件，并更新图标

```
Claude Code 事件 → 钩子脚本 → ~/.code-light/sessions/*.json → 托盘图标
```

零网络端口、零 API、零配置 —— 只依赖磁盘文件。

## 安装

### 前提条件

- macOS 12+ / Linux / Windows 10+
- 已安装并配置 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- Node.js 18+ 和 [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) 工具链
- Windows 用户需安装 [Git for Windows](https://git-scm.com/)（提供 bash 环境）

### 从源码构建

```bash
git clone https://github.com/cuihuapeng/code-light-ai.git
cd code-light-ai
pnpm install
pnpm tauri build
```

构建产物：

| 平台 | 路径 |
|------|------|
| macOS | `src-tauri/target/release/bundle/macos/code-light.app` |
| Linux | `src-tauri/target/release/bundle/deb/code-light_*.deb` |
| Windows | `src-tauri/target/release/bundle/nsis/code-light_*.exe` |

## 使用方法

1. **启动** Code Light —— 系统托盘会出现一个灰色圆点
2. **点击**图标，选择 **"Setup Hooks"** —— 自动将钩子脚本注册到 `~/.claude/settings.json`
3. **在终端启动 Claude Code** —— 托盘图标会随着 Agent 的工作自动变色

就这么简单。在 macOS 上应用以纯菜单栏方式运行，不会出现在 Dock 栏。

### macOS 提示"已损坏"或"无法打开"

从源码构建或下载未签名版本时，macOS 可能会阻止打开。解决方法：

```bash
xattr -cr /path/to/code-light.app
```

然后**右键点击**应用，选择**打开** → 再次点击**打开**即可。只需操作一次。

### 多会话支持

如果你在不同终端同时运行多个 Claude Code 会话，Code Light 会同时追踪所有会话。图标显示所有活跃会话中优先级最高的状态（错误 > 等待 > 工作 > 完成 > 空闲）。

### 自动清理

- 5 分钟内无活动的会话自动移除
- "等待"状态超过 30 秒自动提升为"工作"
- "工作"状态超过 60 秒自动标记为"完成"
- "完成"状态在 10 秒显示窗口后自动清理

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri dev

# 生产构建
pnpm tauri build

# Rust 代码检查
cd src-tauri && cargo clippy
```

## 项目结构

```
code-light/
├── hooks/                          # Claude Code 钩子脚本
│   ├── _helpers.sh                 # 公共函数（会话 ID、原子写入、状态管理）
│   ├── pre-tool-use.sh             # 设置状态为"工作"
│   ├── post-tool-use.sh            # 状态重置（占位）
│   ├── post-tool-use-failure.sh    # 设置状态为"出错"
│   ├── notification.sh             # 权限提示时设置状态为"等待"
│   └── stop.sh                     # 设置状态为"完成"
├── src-tauri/                      # Tauri v2 / Rust 后端
│   ├── src/
│   │   ├── main.rs                 # 入口
│   │   └── lib.rs                  # 托盘图标、轮询、闪烁、钩子注册
│   ├── icons/status/               # 状态指示灯图标（灰、绿、黄、红、蓝）
│   └── tauri.conf.json             # Tauri 配置
├── src/                            # 前端（无可见窗口，仅占位）
├── package.json
└── vite.config.ts
```

## 技术栈

- **后端：** [Tauri v2](https://v2.tauri.app/) + Rust
- **前端：** Vite + TypeScript（最小化 —— 应用没有可见窗口）
- **钩子：** Bash 脚本，注册为 Claude Code 生命周期钩子

## 许可证

MIT
