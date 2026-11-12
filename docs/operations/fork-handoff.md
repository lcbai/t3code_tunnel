# T3 Code 自建穿透版交接

本文面向接手 `lcbai/t3code_tunnel` 的开发者和 agent。对比起点是 fork 当时的上游提交 `61cb845d`，功能快照是 `main` 上的 `626aeb39`。部署和构建记录核对于 2026 年 11 月 12 日。后续检查上游差异时，使用这个基线，或明确记录新的对比范围。

## 原有流程和当前流程

| 场景                                   | 上游基线 `61cb845d`                                                                                                                          | 当前 fork                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 电脑打开应用                           | Electron 启动本机 T3 server，桌面、网页和手机界面主要为英文                                                                                  | 桌面打开即可进入本机环境。共享网页界面、Electron 原生菜单和手机界面已大范围改为简体中文      |
| 跨网连接                               | 在电脑启用 T3 Connect 并登录官方账号。手机登录同一账号，从账号关联的环境列表选择电脑。Clerk 提供账号身份，官方中继负责环境发现和托管隧道分配 | 公网服务器运行 FRP。桌面填 HTTPS 域名和 FRP 密钥，待穿透连接后生成配对二维码，手机扫码并确认 |
| 再次打开手机                           | 通过账号关联的环境和官方托管路由重新访问。上游也已有直连配对和保存环境能力                                                                   | 手机保存 FRP 域名和该环境签发的长期授权。电脑和公网入口恢复后，手机可用同一授权重连          |
| 局域网、Tailscale 和 SSH               | 可通过可达地址直接配对，也有桌面托管的 SSH 连接                                                                                              | 继续使用直连配对、已保存的多路由和桌面 SSH。已配置的公网 HTTPS 地址也可用于配对              |
| 使用 Codex、Claude、Cursor 等 provider | T3 server 使用环境主机上的 provider CLI 和授权                                                                                               | 在运行 T3 server 的电脑完成各 provider 的安装和授权。手机使用已配对环境调用它们              |
| 构建与分发                             | 桌面通过上游正式发布工作流构建多平台、签名并发布 Release 和更新源。手机使用 Expo/EAS 预览、商店发布与 OTA 更新                               | 四条独立的手动 GitHub Actions 构建预览安装包，结果保存在每次运行的 Artifacts                 |

## 汉化与账号功能

- **桌面与网页**。Electron 渲染器使用同一个 Web 客户端。聊天、侧栏、命令面板、设置、文件和连接等界面改为中文，原生菜单、启动恢复页和 macOS 权限提示也有对应修改。Electron 启动语言设为 `zh-CN`。[Electron 入口](../../apps/desktop/src/main.ts) · [原生菜单](../../apps/desktop/src/window/DesktopApplicationMenu.ts) · [Web 设置](../../apps/web/src/components/settings/)
- **Android 与 iOS**。共享的 React Native 界面覆盖首页、会话、环境、设置、文件和操作提示等。相机、麦克风等系统权限描述，以及部分 Kotlin、Swift 原生控件也已汉化。[手机设置](../../apps/mobile/src/features/settings/) · [Expo 配置](../../apps/mobile/app.config.ts) · [原生模块](../../apps/mobile/modules/)
- **汉化边界**。主要通过修改界面文案和区域格式实现。当前还能找到英文或中英混排，例如网页配对页的部分错误、侧栏的 `Pin项目`、手机用量小组件的 `As of` 和 `Next reset`。上游营销站、法律文本和部分开发文档也保留原文。[网页配对页](../../apps/web/src/components/auth/PairingRouteSurface.tsx) · [手机用量小组件](../../apps/mobile/src/widgets/SubscriptionUsage.tsx)
- **官方 T3 账号和托管中继**。移除了 Clerk 登录、账号页面、托管环境发现和中继客户端，删除了服务端 cloud 模块、`t3 connect`、`t3 up --connect`、`infra/relay` 及其部署和预览工作流。Electron 保留处理配对深链的入口。官方账号关联的 T3 Chat 入口、托管中继的代理活动推送、手机远程通知注册和相关中继诊断也随这次改动移除。[桌面深链入口](../../apps/desktop/src/app/DesktopLaunchLinks.ts) · [当前 CLI](../../apps/server/src/cli/up.ts)
- **现有设备迁移**。旧记录中只有托管中继路由的环境需要用可达地址重新配对。连接目录迁移会跳过旧中继记录。桌面本机、局域网、Tailscale、已配对的直接 HTTPS 路由和桌面 SSH 使用各自的连接路径。[桌面连接目录迁移](../../apps/desktop/src/app/DesktopConnectionCatalogStore.ts) · [共享连接目录格式](../../packages/client-runtime/src/platform/storageDocument.ts)
- **现有授权**。设备配对、浏览器会话、访问权限、MCP OAuth、各 provider 授权以及 GitHub 等源码托管集成各有独立的认证。服务器产品使用数据仍有单独配置，账号移除只影响相关账号标识和中继诊断。[环境鉴权](../internals/environment-auth.md) · [Provider 授权设置](../../apps/web/src/components/settings/ProviderAuthenticationSection.tsx) · [产品使用数据](../user/telemetry.md)

## 现在如何连接手机

1. 公网服务器准备 HTTPS 域名和 FRP 密钥。当前实例使用 `https://t3.icbai.com`。每个域名接入一台电脑，这台电脑可以授权多部手机。
2. 在电脑打开 **设置 → 共享与访问 → FRP 穿透 → 配置穿透**，填入完整的 HTTPS 地址和服务器提供的密钥，点 **保存并连接**。
3. 状态显示 **已连接** 后点 **手机扫码配对**。手机进入 **设置 → 环境 → ＋**，扫码后点右上角勾号确认。Android 和 iOS 共用直接配对流程。
4. 后续直接打开手机的已保存环境。电脑需要开机、保持可联网并运行 T3 Code。桌面重启后会恢复已保存的穿透设置。穿透掉线恢复后，同一地址和环境可用已有设备授权重连。
5. 要取消某部手机的访问，在电脑的 **共享与访问 → 已授权客户端** 中撤销该会话。**停用 FRP 穿透** 会停止 `frpc` 并清除本机的穿透配置。已有会话记录可在 **已授权客户端** 管理。

局域网场景仍可用 **网络访问** 和普通配对链接。Tailscale HTTPS 适用于已加入同一 tailnet 的设备。桌面托管 SSH 适合把 T3 server 运行在另一台机器上。手机操作的项目、文件和 provider 都属于它当前连接的环境。[其他连接方式](../user/remote-access.md)

### 数据路径与授权

```text
电脑内置 frpc → 公网 HTTPS/WSS → Caddy 的 /~!frp → frps 控制端口
手机 HTTPS/WSS → 公网入口 → Caddy → frps HTTP 虚拟主机
                                      → frpc → 电脑本机 T3 server
```

- **桌面到穿透服务器**。打包时附带 FRP `0.72.0` 的 `frpc`。Electron 生成临时配置，使用 WSS 和系统证书信任链连接 HTTPS origin，默认使用 `443`。本机 T3 server 继续使用自己的监听地址，FRP 可转发它的 loopback HTTP 和 WebSocket。桌面比对公网与本机 `/.well-known/t3/environment` 返回的环境 ID，匹配后才显示已连接。`frpc` 意外退出时会重试，T3 Code 退出时会停止 `frpc`。[桌面 FRP 服务](../../apps/desktop/src/backend/DesktopFrpTunnel.ts) · [应用启动与退出](../../apps/desktop/src/app/DesktopApp.ts)
- **密钥存储**。桌面使用 Electron safeStorage 加密 URL 和密钥，保存在应用数据目录的 `frp-tunnel.enc`。临时 TOML 通过子进程环境变量取密钥。系统安全存储不可用时保存会失败。开发版可通过 `PATH` 或 `T3CODE_FRPC_PATH` 指定客户端；发行包从资源目录启动。FRP 设置只出现在可维护的桌面本机环境中，也受远程客户端管理策略约束。[桌面 IPC](../../apps/desktop/src/ipc/methods/serverExposure.ts) · [FRP 设置界面](../../apps/web/src/components/settings/FrpTunnelSettings.tsx)
- **二维码**。包含 HTTPS 地址和一次性配对码，配对码位于链接片段中，有效期 5 分钟且只能兑换一次。FRP 密钥只供桌面连接服务端。桌面为手机签发的权限受当前客户端可转授权限限制。[配对码存储](../../apps/server/src/auth/PairingGrantStore.ts) · [配对链接格式](../../packages/shared/src/remote.ts)
- **长期授权**。专用的 **手机扫码配对** 按钮请求长期授权。兑换成功后，手机将凭据保存在系统安全存储，服务端会话可撤销。普通 bearer 会话默认 30 天，长期设备会话在数据模型中使用 9999 年到期值。清除手机本地连接、撤销会话或丢失原服务端会话数据后需重新配对。更换域名时，在已保存的环境中按新增路由流程接入新地址。[环境授权](../../apps/server/src/auth/EnvironmentAuth.ts) · [会话存储](../../apps/server/src/auth/SessionStore.ts) · [手机连接存储](../../apps/mobile/src/connection/storage.ts)

## 公网服务器部署

### 当前运行的原生部署

服务器沿用现有 Nginx，对外提供 `t3.icbai.com` 的 HTTP 和 HTTPS。Nginx 使用 Let's Encrypt 证书并转发 WebSocket Upgrade 和原始 Host，后面的 Caddy 与 FRP 端口只监听 loopback。服务由 systemd 管理。

| 组件           | 当前部署位置和职责                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nginx          | `nginx.service` 对外监听 TCP `80` 和 `443`。站点配置在 `/etc/nginx/conf.d/t3.icbai.com.conf`，HTTPS 请求转发至 `127.0.0.1:18081`                    |
| Caddy `2.11.9` | `t3-caddy.service`，配置 `/etc/t3-tunnel/Caddyfile`。在 `127.0.0.1:18081` 处理该站点，将 `/~!frp` 分给 FRP 控制端口，其余请求送到 FRP HTTP 虚拟主机 |
| FRP `0.72.0`   | `t3-frps.service`，配置 `/etc/t3-tunnel/frps/frps.toml`。控制端口 `127.0.0.1:17000`，HTTP 虚拟主机 `127.0.0.1:18080`，启用 token 认证               |
| 二进制和续期   | `frps` 与 `caddy` 位于 `/usr/local/libexec/t3-tunnel/`，证书续期由 `certbot-renew.timer` 调度                                                       |

2026 年 11 月 12 日只读核对时，三个服务均在运行。由该 Nginx 站点访问环境发现接口返回 HTTP 200，TLS 校验通过。运行状态随电脑开关机和网络变化，可在服务端查看状态及近期日志。

```sh
systemctl status nginx t3-caddy t3-frps --no-pager
systemctl list-timers --all certbot-renew.timer
journalctl -u t3-caddy -u t3-frps -n 80 --no-pager
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' https://t3.icbai.com/.well-known/t3/environment
```

检查顺序是域名和 TLS、Nginx 转发、Caddy 分流、FRP 密钥与控制连接、桌面端 T3 server。环境发现接口返回成功且桌面显示已连接后，再检查手机配对与授权。服务器配置和密钥由服务器运维管理，交接时使用已授权的密钥存取方式。

### 新服务器首次部署命令

下面以当前服务器同款的 Alibaba Cloud Linux 3 和 systemd 为例。先给穿透域名配置指向公网服务器的 DNS A 记录，并在云安全组及系统防火墙放行 TCP `80` 和 `443`。使用 IPv6 时，AAAA 记录和 Nginx 的 IPv6 HTTPS 监听也需可达。该域名应留给此穿透站点，Nginx 的 `http` 配置需包含 `/etc/nginx/conf.d/*.conf`。

当前 `t3.icbai.com` 已部署，可直接使用下节的维护命令。原服务器访问 GitHub Raw 的测试失败，FRP 和 Caddy 的 GitHub Releases 下载地址返回 HTTP 200。首次部署时可以在 Mac 上从仓库根目录复制脚本，替换下面的服务器地址。

```bash
scp infra/frp-tunnel/deploy-native.sh root@NEW_SERVER_IP:/root/t3-tunnel-deploy.sh
ssh root@NEW_SERVER_IP
```

在新服务器上安装依赖并运行脚本。将示例域名和邮箱换成自己的值。

```bash
dnf install -y nginx certbot ca-certificates curl openssl tar gzip shadow-utils util-linux
bash /root/t3-tunnel-deploy.sh t3.example.com admin@example.com
```

服务器可直连 GitHub Raw 时，也可以直接下载脚本。下载成功后执行相同的依赖安装和部署命令。

```bash
curl -fsSL https://raw.githubusercontent.com/lcbai/t3code_tunnel/main/infra/frp-tunnel/deploy-native.sh \
  -o /root/t3-tunnel-deploy.sh
```

如果软件源缺少 `certbot`，先启用适合该发行版的软件源再安装依赖。启用了 SELinux 的服务器还需允许 Nginx 连接到 Caddy 的 loopback 端口，可以在看到相关 SELinux 拒绝后按主机策略配置。当前服务器的 SELinux 处于 Disabled 状态。[阿里云软件源说明](https://www.alibabacloud.com/help/en/ecs/user-guide/manage-and-use-linux-software-repositories)

脚本下载并校验固定版本的 `frps` 和 Caddy，创建服务用户、配置和 systemd 服务。FRP 密钥只在文件缺失时生成。Nginx 先提供 ACME HTTP 验证路径，Certbot 通过 webroot 签发证书后再启用 HTTPS 反向代理。证书续期由 `certbot-renew.timer` 调度，续期成功时验证并重载 Nginx。已有不同的站点或穿透配置时脚本会停止，避免覆盖。证书签发失败时，修好 DNS 或端口后可用同一命令重试。[原生部署脚本](../../infra/frp-tunnel/deploy-native.sh) · [FRP 发布包](https://github.com/fatedier/frp/releases/tag/v0.72.0) · [Caddy 发布包](https://github.com/caddyserver/caddy/releases/tag/v2.11.9) · [Certbot webroot 与续期](https://eff-certbot.readthedocs.io/en/stable/using.html)

部署完成后，在服务器的可信终端读取 FRP 密钥，填到电脑端的 **配置穿透**。域名使用完整的 `https://` 地址，手机扫码使用电脑生成的一次性码。

```sh
sudo cat /etc/t3-tunnel/frps/token
```

### 已部署服务器的维护命令

下面在服务器上执行。前四条验证服务配置和运行状态，最后一条使用 Let's Encrypt 测试环境验证续期流程。

```sh
sudo runuser -u t3-frps -- /usr/local/libexec/t3-tunnel/frps verify -c /etc/t3-tunnel/frps/frps.toml
sudo /usr/local/libexec/t3-tunnel/caddy validate --config /etc/t3-tunnel/Caddyfile --adapter caddyfile
sudo nginx -t
sudo systemctl status nginx t3-caddy t3-frps certbot-renew.timer --no-pager
sudo certbot renew --cert-name t3.icbai.com --dry-run
```

修改了某个组件的配置时，先验证相应配置，再执行对应的重启或重载命令。重启穿透服务会短暂断开已连接设备，原授权仍可在恢复后重连。

```sh
sudo systemctl restart t3-frps
sudo systemctl restart t3-caddy
sudo nginx -t && sudo systemctl reload nginx
```

部署后从外部访问环境发现接口。桌面尚未注册域名时，HTTP 404 可以是正常结果。桌面显示 **已连接** 后，接口应返回 HTTP 200，再在手机上扫码验证。

```sh
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://t3.icbai.com/.well-known/t3/environment
```

### 仓库中的 Compose 示例

[`infra/frp-tunnel`](../../infra/frp-tunnel/) 是可供新服务器采用的部署示例。示例直接由 Caddy 接管公网 `80` 和 `443` 并申请证书，容器内 `frps` 使用 `7000` 和 `8080`。把域名写入本地 `.env`，用 `.env.token` 保存生成的密钥。当前实例采用上面的原生服务与 Nginx，接手时先确认正在维护哪套部署。[Compose 部署步骤](../user/remote-access.md#自建-frp-穿透)

## 打包与交付

### 和上游发布的关系

- 上游桌面工作流先生成一份共享 JS 构建，再并行打包 macOS、Windows 和 Linux 的多个架构。Windows 正式包在 Linux 构建，附带同架构 Linux CLI 作为 WSL runtime，再用对应 Windows runner 验证。发布还涉及签名、公证、冒烟测试、GitHub Release、更新元数据及 CLI 包。上游手机独立使用 EAS 构建预览和正式发布。
- fork 的四条工作流分别构建指定平台。打开本仓库 **Actions**，选对应工作流、分支，再点 **Run workflow**。交付同一批包时，核对每次运行的提交 SHA。结果在 **Artifacts**，保留 14 天。桌面包使用预览版本，手机预览构建关闭 Expo OTA。正式发布和商店工作流依然可以在仓库历史与工作流目录中找到。[`release.yml`](../../.github/workflows/release.yml) · [手机 EAS 正式流程](../../.github/workflows/mobile-eas-production.yml) · [fork 打包说明](./release.md#fork-installation-packages)

| 工作流                                                          | 构建方式                                                                                     | 产物和限制                                                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [构建 Android APK](../../.github/workflows/fork-android.yml)    | `ubuntu-24.04`，JDK 17，Expo prebuild 后用 Gradle `:app:assembleRelease` 构建 `arm64-v8a`    | 预览版 APK，调试密钥签名，内置 JS bundle。构建校验 APK 签名与 bundle                                                   |
| [构建 iOS 安装包](../../.github/workflows/fork-ios.yml)         | `xcode-27`，Expo prebuild、CocoaPods、Xcode Release 构建                                     | 默认 ARM64 iPhone IPA 待签名，最低 iOS 18。可选模拟器 ZIP 或 Ad Hoc 签名 IPA                                           |
| [构建 macOS DMG](../../.github/workflows/fork-macos.yml)        | `macos-26`，Apple Silicon，使用 `vp run dist:desktop:dmg:arm64`                              | ARM64 DMG，内含临时签名的 App 和 `frpc`，使用 `hdiutil verify` 校验                                                    |
| [构建 Windows 安装包](../../.github/workflows/fork-windows.yml) | `windows-2022`，原生 Windows、Visual Studio 2022 和 Rust，使用 `vp run dist:desktop:win:x64` | x64 NSIS 安装程序，采用 Windows 原生后端和随包 `frpc.exe`。当前安装包未做发行签名，内置 WSL Linux CLI 归档为可选构建项 |

iOS 的 `iphone-signed` 模式需要 Apple Distribution 证书、与设备和 Bundle ID 匹配的 Ad Hoc 描述文件，以及需要时的证书密码，通过 Actions Secrets 配置。默认的待签名路径已验证。Ad Hoc 和模拟器分支尚未在这批构建中实跑。[iOS 签名设置](./release.md#fork-installation-packages)

### 同一提交的四个实际产物

这批包都来自 `626aeb397217f3eaa4227922bdf73dc72e998217`，已解包保存于打包电脑的 `~/Downloads/T3-Code-626aeb39/`。

| 平台    | 文件                                             | 构建记录                                                                                                             |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Android | `T3-Code-Android-arm64.apk`                      | [GitHub 产物](https://github.com/lcbai/t3code_tunnel/actions/runs/43063349526/artifacts/13875788972)                 |
| iOS     | `T3Code-ios-unsigned.ipa`                        | [GitHub 产物](https://github.com/lcbai/t3code_tunnel/actions/runs/43063350155/artifacts/13875383948)                 |
| macOS   | `T3-Code-0.1.8-preview.20261112.local-arm64.dmg` | [GitHub 两次排队未分配构建机](https://github.com/lcbai/t3code_tunnel/actions/runs/43063350335)，使用同提交在本机打包 |
| Windows | `T3-Code-0.1.8-preview.20261111.4-x64.exe`       | [GitHub 产物](https://github.com/lcbai/t3code_tunnel/actions/runs/43063350448/artifacts/13875675522)                 |

```text
988090e7651b0885a0e9bbce184eb4214257390665534ea2cb7680cad4b6df49  T3-Code-Android-arm64.apk
f94633a95527ba907ea995420ac31004d783786ba05cac25e3aef568acd04787  T3Code-ios-unsigned.ipa
0a027e110d8518c05614a3d1c31c55615b1ba5e4d414eb78d8c662e9b95f8402  T3-Code-0.1.8-preview.20261112.local-arm64.dmg
92ac3f78d2d4f57d2d4f99dfb2afed21e9e09bf63f2e6beb0c44c93e01c8c6de  T3-Code-0.1.8-preview.20261111.4-x64.exe
```

此前单独发布的 [macOS FRP 预发行版](https://github.com/lcbai/t3code_tunnel/releases/tag/mac-v0.1.8-frp.1) 对应 `13bd0a1f`。以后需要当前代码的包时，以构建记录里的提交为准。Apple Silicon runner 排队失败时，可在本机装好仓库要求的 Node、Vite+、Rust 和 macOS 命令行工具后运行同一个桌面打包脚本。[本地开发与构建](./development.md)

## 给后续 agent 的验证入口

- **改连接流程**。从 [FRP 设置](../../apps/web/src/components/settings/FrpTunnelSettings.tsx)、[桌面 FRP 服务](../../apps/desktop/src/backend/DesktopFrpTunnel.ts)、[契约](../../packages/contracts/src/ipc.ts) 和 [环境授权](../../apps/server/src/auth/EnvironmentAuth.ts) 跟到手机现有配对入口。保留生成二维码的授权检查、一次兑换、会话撤销和本机环境 ID 对比。检查公网 HTTPS/WSS、局域网、Tailscale 和桌面 SSH 中与改动有关的路径。
- **复现穿透测试**。此前用真实 `frps`、Caddy 和 `frpc` 验证过测试环境的配对及 WebSocket。重启隧道后，用原设备授权确认能重新连接。本次交接另做了部署只读检查。已有针对桌面恢复与停用、二维码请求长期授权、普通期限之后继续使用及撤销授权的回归覆盖。[桌面测试](../../apps/desktop/src/backend/DesktopFrpTunnel.test.ts) · [浏览器测试](../../apps/web/src/components/settings/FrpTunnelSettings.browser.test.tsx) · [授权测试](../../apps/server/src/auth/EnvironmentAuth.test.ts)
- **改构建**。Android 语音转写使用的 ML Kit alpha2 需要兼容 Kotlin 2.4 元数据，Expo Android 配置固定到 Kotlin `2.4.0`。在该编译器上，`expo-quick-actions` 的图标模块需要显式返回类型。对应补丁、版本 override 和 lockfile 一起维护。Windows 文件数量检查保留 80 个的上限，独立排除生成的 `resources/server-compile-cache` 目录。首次原生 Windows 打包的 90 个文件中有 22 个是该缓存，修复后其余 68 个通过上限和运行时验证。[Android 配置](../../apps/mobile/app.config.ts) · [Kotlin 兼容补丁](../../patches/expo-quick-actions@6.0.2.patch) · [桌面打包脚本](../../scripts/build-desktop-artifact.ts)
- **本批验证范围**。已校验四个安装包的完整性。Android 校验签名和内置 JS，iOS 核对真机架构与 JS，Mac 校验 DMG 并确认资源中的 ARM64 `frpc`，Windows 核对 PE 和打包运行时。真机安装、实际 iOS 签名和 Windows WSL 模式属于另外的验证场景。
- **修改与推送**。先读 [仓库指引](../../AGENTS.md)。使用隔离开发状态和已有的针对性测试，推送前运行 `vp run check:changed`。汉化变更记得同步用户可见标签、搜索词、无障碍名称和对应测试。部分上游文档仍有 T3 Connect 旧描述，核对现行代码和这份交接后再使用。

## 提交索引

| 提交                   | 变更                                         |
| ---------------------- | -------------------------------------------- |
| `61cb845d`             | fork 对比基线                                |
| `40f6c80a`             | 简体中文界面，移除官方账号、Clerk 和托管中继 |
| `7e6cad90`             | 补充中文界面并同步回归测试                   |
| `13bd0a1f`             | 集成 FRP，新增自建服务器配置和手机长期配对   |
| `fd29e29c`             | 四条手动打包工作流                           |
| `5af6fff5`、`d38b07d9` | Windows 打包诊断与字节码缓存计数修复         |
| `e6a70d8b`、`626aeb39` | Android Kotlin 工具链和图标模块兼容修复      |
