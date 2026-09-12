# 已有 VPS：IP HTTPS 与现有服务共存

适用于已有 Debian 12 / Linux VPS、不想购买域名的两人自用场景。这里记录原生 Node.js + systemd + Nginx 的部署结构与维护要求；它不是可以盲目运行的一键安装脚本。安装前需要检查系统、资源、监听端口和防火墙，保留现有服务与登录方式。

## 网络与证书

- 桌宠后端只监听 `127.0.0.1:8787`，不要向公网开放数据库或后端端口。
- Nginx 在 TCP `8443` 提供 HTTPS，代理到后端。客户端填写 `https://服务器公网IP:8443`，无需使用默认的 443 端口。
- TCP `80` 只用于 `/.well-known/acme-challenge/` 证书验证，其余请求返回 404。
- 原有 TCP `22`、`443` 及其他业务的防火墙规则与进程保持不变。不重置防火墙、不安装会改写网络规则的面板。
- 如果供应商另有云防火墙，也需要放行 TCP 80、8443。端口空闲不代表公网已经可达。
- IP HTTPS 仍有跨境网络的影响；应让双方实际测试，不以服务器位置或一次健康检查承诺延迟。

Let's Encrypt 已支持公网 IP 证书，但证书有效期只有约 6 天，必须自动续期。使用 Certbot 5.4 或更新版本，不使用 Debian 12 自带的旧版 Certbot申请 IP 证书。参考[官方 IP 证书说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。

首次在测试环境验证成功后，再申请可信生产证书。核心申请参数如下，IP 需替换为自己的：

```sh
/opt/pawbridge-certbot/bin/certbot certonly \
  --preferred-profile shortlived \
  --webroot --webroot-path /var/lib/pawbridge-acme \
  --ip-address 203.0.113.10 --cert-name 203.0.113.10
```

证书路径是 `/etc/letsencrypt/live/服务器IP/` 下的 `fullchain.pem` 和 `privkey.pem`。IP 证书可用于该 IP 的 8443 端口，证书中不包含端口号。客户端必须正常校验证书，不能用自签名证书或 `curl -k` 作为上线验收。

## 原生部署布局

| 路径 / 服务 | 用途 |
|---|---|
| `/opt/pawbridge/server/` | 与 GitHub 版本一致的后端代码，无 npm 运行时依赖 |
| `/opt/pawbridge-node/` | 从 Node.js 官方下载并校验 SHA-256 的 Node.js 24 运行时 |
| `/opt/pawbridge-certbot/` | 独立 Python 虚拟环境中的 Certbot |
| `/etc/pawbridge/server.env` | 仅 root 可读的运行参数和随机建家密钥 |
| `/var/lib/pawbridge/pawbridge.sqlite` | SQLite 数据库，目录仅 `pawbridge` 服务用户可访问 |
| `/etc/nginx/conf.d/pawbridge-*.conf` | 独立 HTTP 验证和 HTTPS 代理配置 |
| `pawbridge.service` | 非 root 运行、开机启动、失败重启，内存上限 256MB |
| `pawbridge-cert-renew.timer` | 每天两次检查续期，成功后验证配置并重新加载 Nginx |

`server.env` 包含 `HOST=127.0.0.1`、`PORT=8787`、`DATABASE_PATH=/var/lib/pawbridge/pawbridge.sqlite` 和至少 24 字符的随机 `PAWBRIDGE_SETUP_KEY`。即使后端仅监听回环地址，经代理对外服务时也必须设置建家密钥。

不把 `.env`、数据库、SSH 私钥、证书私钥或用户身份令牌上传 GitHub。代码上传可以用已有 SSH 连接，不必把个人 GitHub 令牌放到服务器。

## 检查与日常维护

```sh
systemctl status pawbridge --no-pager
systemctl list-timers pawbridge-cert-renew.timer --no-pager
journalctl -u pawbridge-cert-renew.service -n 30 --no-pager
curl --fail https://服务器公网IP:8443/health
```

续期服务应运行 `certbot renew`，并传入部署钩子 `nginx -t && systemctl reload nginx`。如果 systemd 定时器已经设置随机延迟，可以传入 `--no-random-sleep-on-renew`，避免 Certbot 再额外等待。设置定时器后还需模拟续期，验证证书验证路径及重新加载钩子都正常：

```sh
/opt/pawbridge-certbot/bin/certbot renew --dry-run --no-random-sleep-on-renew \
  --cert-name 服务器公网IP --run-deploy-hooks \
  --deploy-hook '/usr/sbin/nginx -t && /bin/systemctl reload nginx'
```

这不代表未来续期必定成功：不要关闭 80 端口，定期检查定时任务失败记录和证书有效期。变更 IP 时需要重新签发证书并修改客户端服务地址。

上线需验证：真实 HTTPS 证书、配对、双方状态同步、双向消息、重复发送去重，以及**仅重启桌宠服务**后消息仍保留。桌面 GUI 和双方各自的网络仍需实机验收。

升级或迁移前，停止 `pawbridge.service`，备份完整的 `/var/lib/pawbridge/` 与单独保护的 `server.env`，再启动服务；不要仅复制运行中 SQLite 的主文件。备份应存到另一台设备并限制读取权限。

迁往 Render 时仍使用同一后端代码，数据库放到付费持久磁盘，保持单实例。当前客户端没有身份自动迁移工具：服务地址改变时，先规划客户端会话迁移，或明确选择重新建家配对；不要假定“更改连接设置”会自动保留原来的身份与历史数据。
