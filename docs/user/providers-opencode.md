# OpenCode

Install and authenticate OpenCode on the machine running your environment, then
enable it in **Settings > Providers**. See [provider setup](./install.md#providers).
T3 Code requires OpenCode 1.14.19 or newer, including when you connect an existing
OpenCode server.

## OpenCode 2

T3 Code supports OpenCode 2.0.18 and newer. It detects the version on its own, so
the same provider settings work for OpenCode 1.x and 2.x. OpenCode 1.x shows
**Limited support** in its provider settings.

OpenCode 2 is a separate package, `@opencode/cli`. To move from 1.x, install it
yourself, for example `npm install -g @opencode/cli`. Then refresh provider status.
T3 Code's update button updates whichever package you have installed. It never
switches a 1.x install to 2.x.

OpenCode 2 converts the shared OpenCode database to its own format the first time it
runs. Don't run OpenCode 1.x and 2.x side by side on the same machine. Threads you
started on 1.x continue on 2.x.

## Compaction

OpenCode compacts long conversations itself, and T3 Code has no setting for it. On
OpenCode 2, change it under `compaction` in an OpenCode configuration file, such as
`opencode.json`: `auto` turns
automatic compaction on or off, `buffer` sets the token headroom, and `keep.tokens`
sets how much recent context stays. OpenCode 1.x configures compaction differently.
Send `/compact` to compact a thread yourself.

## Local or external server

Leave **Server URL** empty to let T3 Code start OpenCode locally. A password in
provider settings applies to both that server and T3 Code's connection. With no
password setting, the local server uses `OPENCODE_SERVER_PASSWORD` from its
environment.

To use an existing OpenCode server, set **Server URL** and its password in provider
settings. T3 Code uses only that configured password for an external server; it
does not forward a local `OPENCODE_SERVER_PASSWORD`. If connection or version checks
fail, check the URL, credentials, and OpenCode version, then refresh provider status.

After a lost connection, send another prompt to reconnect to the same OpenCode
session.

## 豆包与火山方舟 Coding Plan

先在运行 T3 Code 环境的电脑上安装 OpenCode。在桌面或网页打开 **设置 → 代理提供方 →
添加代理提供方**，选择**豆包（火山方舟）**。进入**配置**后填写方舟 Coding Plan 套餐的专属密钥，
或引用已有密钥。也可以先添加，再到豆包或已有 OpenCode 实例的设置中填写**火山方舟 Coding Plan 密钥**。

留空服务器地址，由 T3 Code 启动 OpenCode。刷新提供方状态，在会话中选择刚配置的实例和豆包模型，
例如 `volcengine-coding-plan/doubao-seed-evolving`。配对到同一环境的手机也可以选择这些模型。

OpenCode 2.0.28 可以自动发现方舟套餐模型。使用 OpenCode 1.14.19 时，先按下方指南
在 OpenCode 中配置 `volcengine-coding-plan`，并用 `{env:ARK_CODING_PLAN_API_KEY}` 引用
T3 Code 设置中的密钥。

连接已有 OpenCode 服务器时，在该服务器上配置方舟套餐，再刷新 T3 Code 的模型列表。
[火山方舟 OpenCode 配置指南](https://docs.volcengine.com/docs/ark/coding-plan-personal-ai-opencode?lang=zh)

### 使用豆包账号

在运行 T3 Code 环境的电脑上安装[官方豆包 CLI](https://www.npmjs.com/package/@bytedance/doubao-cli)，
然后在桌面或网页打开 **设置 → 代理提供方 → 豆包**，选择 **扫码登录**。

```sh
npm install -g @bytedance/doubao-cli
```

已有豆包实例的 Coding Plan 密钥和 OpenCode 设置可以从 **火山方舟配置** 展开。
要在项目目录中运行豆包，在桌面或网页的 **会话详情** 中选择 **打开豆包 CLI**。在手机上，进入已有会话，从 **终端**
菜单选择 **打开豆包 CLI**。T3 Code 会在该会话的工作区打开一个新终端。发送任务、继续会话
和审批工具操作都在豆包终端里完成。按 `Esc` 可请求中断当前任务。

## Approvals

OpenCode follows the shared [permission modes](./permission-modes.md). **Auto** has
the same rules as **Supervised** because OpenCode has no AI approval reviewer.
Environment files such as `.env` and `.env.local` need approval in restricted
modes even though normal file reads do not; `.env.example` is allowed.

**Allow for workspace** applies to matching requests in other OpenCode sessions
using the same workspace. It is broader than the current thread, especially on a
shared external server. Use **Allow once** for a single request. Denying an action
does not stop the whole turn.

## Refresh models, commands, and skills

After changing an OpenCode login or configuration, use **Refresh provider status**
in **Settings > Providers** for that environment. On mobile, use **Refresh models**
in the thread settings. Reconnecting also refreshes the catalog; periodic provider
health checks do not.

Credential changes are read on refresh. Native OpenCode configuration can remain
cached while the local helper is running. Let it sit for 30 seconds without model
refreshes or text-generation work, then refresh again to reload the files. Repeated
refreshes keep the helper alive. An external server may need its own reload or
restart before T3 Code can see configuration changes.

Existing threads keep their selected model and options even when it disappears
from the catalog. If OpenCode rejects that model, select an available one and retry.
