#!/usr/bin/env bash
set -euo pipefail
umask 022
export LC_ALL=C

die() { printf '%s\n' "$*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "用法: sudo bash deploy-native.sh <域名> <证书续期联系邮箱>"
(( EUID == 0 )) || die "请以 root 身份运行。"
domain=$1
email=$2
label='[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
[[ ${#domain} -le 253 && $domain =~ ^($label\.)+$label$ ]] || die "请输入小写的完整 DNS 域名。"
[[ $email == ?*@?* ]] || die "请输入有效的联系邮箱。"

case "$(uname -m)" in
  x86_64)
    arch=amd64
    frp_sha256=daf719b32ca2778770bb92955e231a07414d754378b9af328aa2642862479804
    caddy_sha256=5b8cb7faf8726a2028ad96a66e54e6e81e8f361bc6175e5d22bbd997cc5177fb
    ;;
  aarch64|arm64)
    arch=arm64
    frp_sha256=02180b857480302fd934e9ddbd50fe2f73229f99062f88756abc6de9df5e95cf
    caddy_sha256=5e377cff994fc9362a6fcf695c53f226cfca3a3ef85bd3a3687cf252d6310165
    ;;
  *) die "支持 Linux x86_64 和 aarch64。" ;;
esac

for tool in nginx certbot curl sha256sum tar openssl systemctl flock runuser; do
  command -v "$tool" >/dev/null || die "缺少 $tool，请先执行文档中的依赖安装命令。"
done

exec 9>/run/lock/t3-tunnel-deploy.lock
flock -n 9 || die "另一个穿透安装正在运行。"

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
bin_dir=/usr/local/libexec/t3-tunnel
config_dir=/etc/t3-tunnel
site="/etc/nginx/conf.d/$domain.conf"
webroot=/var/www/certbot
cert_dir="/etc/letsencrypt/live/$domain"
token_file="$config_dir/frps/token"
hook=/etc/letsencrypt/renewal-hooks/deploy/t3-tunnel-reload.sh

cat >"$work/frps.toml" <<'EOF'
bindAddr = "127.0.0.1"
proxyBindAddr = "127.0.0.1"
bindPort = 17000
vhostHTTPPort = 18080

auth.method = "token"
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "/etc/t3-tunnel/frps/token"
EOF

cat >"$work/Caddyfile" <<EOF
{
	admin off
	persist_config off
}
http://$domain:18081 {
	bind 127.0.0.1
	reverse_proxy /~!frp 127.0.0.1:17000
	reverse_proxy 127.0.0.1:18080
}
EOF

cat >"$work/t3-frps.service" <<'EOF'
[Unit]
Description=T3 Code FRP tunnel server
After=network.target

[Service]
User=t3-frps
Group=t3-frps
ExecStart=/usr/local/libexec/t3-tunnel/frps -c /etc/t3-tunnel/frps/frps.toml
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat >"$work/t3-caddy.service" <<'EOF'
[Unit]
Description=T3 Code FRP Caddy router
After=t3-frps.service
Wants=t3-frps.service

[Service]
User=t3-caddy
Group=t3-caddy
StateDirectory=t3-caddy
Environment=XDG_DATA_HOME=/var/lib/t3-caddy
Environment=XDG_CONFIG_HOME=/var/lib/t3-caddy
ExecStart=/usr/local/libexec/t3-tunnel/caddy run --config /etc/t3-tunnel/Caddyfile --adapter caddyfile
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat >"$work/renew-hook" <<EOF
#!/bin/sh
if [ "\${RENEWED_LINEAGE:-}" = "$cert_dir" ]; then
    /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
fi
EOF

cat >"$work/http.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    location ^~ /.well-known/acme-challenge/ {
        root $webroot;
        try_files \$uri =404;
    }

    location / {
        return 301 https://$domain\$request_uri;
    }
}
EOF

{
  cat <<'EOF'
map $http_upgrade $t3_frp_connection {
    default upgrade;
    '' close;
}
EOF
  cat "$work/http.conf"
  cat <<EOF

server {
    listen 443 ssl http2;
    server_name $domain;
    ssl_certificate $cert_dir/fullchain.pem;
    ssl_certificate_key $cert_dir/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$t3_frp_connection;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
EOF
} >"$work/https.conf"

sources=(frps.toml Caddyfile t3-frps.service t3-caddy.service renew-hook)
targets=("$config_dir/frps/frps.toml" "$config_dir/Caddyfile"
  /etc/systemd/system/t3-frps.service /etc/systemd/system/t3-caddy.service "$hook")
for i in "${!sources[@]}"; do
  target=${targets[i]}
  if [[ -L $target ]] || { [[ -e $target ]] && ! cmp -s "$work/${sources[i]}" "$target"; }; then
    die "已有不同配置 $target，请按文档中的现有部署命令维护。"
  fi
done
if [[ -L $site ]] || { [[ -e $site ]] && ! cmp -s "$work/http.conf" "$site" && ! cmp -s "$work/https.conf" "$site"; }; then
  die "已有不同站点配置 $site，请先核对该站点。"
fi
if [[ -L $token_file ]] || { [[ -e $token_file ]] && [[ ! -f $token_file || ! -s $token_file ]]; }; then
  die "无法复用 $token_file，请先核对现有密钥文件。"
fi
nginx -t

frp_archive="frp_0.72.0_linux_$arch"
caddy_archive="caddy_2.11.9_linux_$arch"
curl -fsSL --retry 3 --proto '=https' -o "$work/frp.tar.gz" \
  "https://github.com/fatedier/frp/releases/download/v0.72.0/$frp_archive.tar.gz"
curl -fsSL --retry 3 --proto '=https' -o "$work/caddy.tar.gz" \
  "https://github.com/caddyserver/caddy/releases/download/v2.11.9/$caddy_archive.tar.gz"
printf '%s  %s\n' "$frp_sha256" "$work/frp.tar.gz" "$caddy_sha256" "$work/caddy.tar.gz" | sha256sum -c -
tar -xzf "$work/frp.tar.gz" -C "$work" "$frp_archive/frps"
tar -xzf "$work/caddy.tar.gz" -C "$work" caddy
for binary in frps caddy; do
  source="$work/$binary"
  if [[ $binary == frps ]]; then source="$work/$frp_archive/frps"; fi
  if [[ -L $bin_dir/$binary ]] || { [[ -e $bin_dir/$binary ]] && ! cmp -s "$source" "$bin_dir/$binary"; }; then
    die "已有不同版本的 $bin_dir/$binary，请先核对现有部署。"
  fi
done

for account in t3-frps t3-caddy; do
  getent group "$account" >/dev/null || groupadd --system "$account"
  getent passwd "$account" >/dev/null || useradd --system --gid "$account" --no-create-home --shell /sbin/nologin "$account"
done
mkdir -p "$bin_dir" "$webroot/.well-known/acme-challenge" "$(dirname "$hook")"
install -d -o root -g t3-frps -m 0750 "$config_dir/frps"

install_if_missing() {
  local destination=$1
  shift
  if [[ ! -e $destination ]]; then
    install "$@" "$destination.t3-new"
    mv -f -- "$destination.t3-new" "$destination"
  fi
}

install_if_missing "$bin_dir/frps" -m 0755 "$work/$frp_archive/frps"
install_if_missing "$bin_dir/caddy" -m 0755 "$work/caddy"
if [[ ! -e $token_file ]]; then
  openssl rand -hex 32 >"$work/token"
  install_if_missing "$token_file" -o root -g t3-frps -m 0640 "$work/token"
fi
install_if_missing "${targets[0]}" -o root -g t3-frps -m 0640 "$work/frps.toml"
for i in 1 2 3; do
  install_if_missing "${targets[i]}" -m 0644 "$work/${sources[i]}"
done
install_if_missing "$hook" -m 0755 "$work/renew-hook"

runuser -u t3-frps -- "$bin_dir/frps" verify -c "${targets[0]}"
XDG_CONFIG_HOME="$work" XDG_DATA_HOME="$work" "$bin_dir/caddy" validate --config "${targets[1]}" --adapter caddyfile
systemctl daemon-reload
systemctl enable --now t3-frps t3-caddy

activate_site() {
  if [[ -e $site ]]; then cp -p "$site" "$work/previous.conf"; fi
  install -m 0644 "$1" "$site.t3-new"
  mv -f -- "$site.t3-new" "$site"
  if nginx -t; then
    if systemctl is-active --quiet nginx; then
      if systemctl reload nginx; then return; fi
    elif systemctl enable --now nginx; then
      return
    fi
  fi
  if [[ -e $work/previous.conf ]]; then
    cp -p "$work/previous.conf" "$site"
  else
    rm -f -- "$site"
  fi
  die "Nginx 站点启用失败，已恢复写入前的站点配置。"
}

if [[ ! -s $cert_dir/fullchain.pem || ! -s $cert_dir/privkey.pem ]]; then
  activate_site "$work/http.conf"
  certbot certonly --webroot -w "$webroot" --cert-name "$domain" -d "$domain" \
    --non-interactive --agree-tos --email "$email"
fi
activate_site "$work/https.conf"
systemctl enable --now certbot-renew.timer
for service in nginx t3-frps t3-caddy; do
  systemctl is-active "$service"
done
http_code=$(curl -sS --noproxy '*' --resolve "$domain:443:127.0.0.1" --max-time 8 -o /dev/null \
  -w '%{http_code}' "https://$domain/.well-known/t3/environment")
case "$http_code" in
  200|404) printf 'HTTPS 已验证，环境发现返回 HTTP %s\n' "$http_code" ;;
  *) die "环境发现返回 HTTP $http_code，请检查代理和服务日志。" ;;
esac
printf '桌面端地址: https://%s\nFRP 密钥文件: %s\n' "$domain" "$token_file"
