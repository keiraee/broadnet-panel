# broadnet-panel

可移植的中国广电（10099）个人中心面板：自定义 UI + 官方加密 API + Docker 一键运行。

默认对外端口 **9994**（容器内仍为 9993）。

## Docker（推荐）

```bash
docker compose up -d --build
```

浏览器打开 http://localhost:9994/  
短信登录后查看余额 / 套餐余量 / 套外费用。会话保存在 Docker volume `browser-profile`，换机器可带走该 volume。

```bash
docker compose down
```

### 改端口

默认映射主机 **9994** → 容器 9993。若要改主机端口，编辑 `docker-compose.yml` 的 `ports`，例如 `"8080:9993"`。

> 说明：部分 Windows 上直接绑 9993 可能被 Hyper-V 保留段拦住，所以默认用 9994。
## 本机开发

```bash
# 终端 1
npm --prefix server install
cd server && npx playwright install chromium
npm --prefix server run dev

# 终端 2
npm --prefix web install
npm --prefix web run dev
```

可选：`HEADLESS=0` 弹出可视浏览器便于排查。

## 架构简述

- 前端：Vue 自定义 UI
- 后端：Hono BFF；用 Playwright 维持 WAF Cookie
- 业务请求：Node 侧复现官网 RSA/`Access` 密封后直调 `/contact-web`

## 注意

- 仅供个人自用本地部署；请遵守官网服务条款
- WAF / 会话过期后需重新验证码登录
