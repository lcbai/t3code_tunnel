# WorkBuddy 本地助理（实验功能）

这个实验功能仅在 T3 命令行提供，可以查看腾讯 WorkBuddy 桌面端的助理状态、发送消息和查看回复。
在安装了 `t3` 的终端里运行这些命令，保持 WorkBuddy 桌面端已登录、正在运行并联网。

先在 WorkBuddy 开放平台为应用申请 `user.localassistant.readable` 和 `user.localassistant.invokable`。
应用获批后，完成 WorkBuddy 的 OAuth 授权并换取访问令牌。T3 通过当前命令进程的
`T3CODE_WORKBUDDY_ACCESS_TOKEN` 读取该令牌。使用开放平台签发的令牌，避免复制 WorkBuddy
桌面端登录凭据，或把真实令牌写入 Git、Shell 历史和配置文件。
[WorkBuddy Open API](https://open.workbuddy.cn/docs/openapi) · [权限申请](https://open.workbuddy.cn/docs/third-party-app#权限配置)

在 Bash 或 Zsh 中运行以下命令。终端提示时粘贴令牌。将 `MESSAGE_ID` 替换为发送命令返回的消息 ID。

```sh
printf 'WorkBuddy 访问令牌：'
IFS= read -rs workbuddy_access_token
printf '\n'

T3CODE_WORKBUDDY_ACCESS_TOKEN="$workbuddy_access_token" t3 workbuddy status
T3CODE_WORKBUDDY_ACCESS_TOKEN="$workbuddy_access_token" t3 workbuddy send "请回复连接成功"
T3CODE_WORKBUDDY_ACCESS_TOKEN="$workbuddy_access_token" t3 workbuddy replies MESSAGE_ID

unset workbuddy_access_token
```

WorkBuddy 的本地助理共用一条会话。`replies` 返回指定消息 ID 之后的增量消息，可能包含同一会话中从其他客户端发起的对话。
发送后如果还没有新消息，可用同一个 ID 再查一次。[本地助理 API](https://open.workbuddy.cn/docs/openapi#本地助理-api)
