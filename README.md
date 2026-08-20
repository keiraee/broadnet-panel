# broadnet-panel

可移植的中国广电（10099）个人中心面板：自定义 UI + 官方加密 API + Docker 一键运行。

默认对外端口 **9994**（容器内仍为 9993）。

## Docker / WSL 一键

**建议在 WSL 的 Linux 家目录里跑**（不要长期在 `/mnt/c`、`/mnt/h` 上 build，又慢又容易出权限问题）：

```bash
git clone https://github.com/keiraee/broadnet-panel.git ~/broadnet-panel \
  && cd ~/broadnet-panel \
  && docker compose up -d --build
```

打开 http://localhost:9994/

看日志：

```bash
docker compose -f ~/broadnet-panel/docker-compose.yml logs -f
```

停止：

```bash
cd ~/broadnet-panel && docker compose down
```

### 若容器马上退出（exit 137）

137 = 内存不够（Chromium）。给 WSL 加内存，在 Windows 用户目录创建 `%UserProfile%\.wslconfig`：

```ini
[wsl2]
memory=4GB
swap=2GB
```

然后在 PowerShell 执行 `wsl --shutdown`，再开 WSL 重新 `docker compose up -d`。

本仓库 compose 已加 `shm_size: 1gb`，减轻 Chromium 在容器里崩溃的概率。

### 改端口

编辑 `docker-compose.yml` 的 `ports`，例如 `"8080:9993"`。

## 本机开发（非 Docker）

```bash
npm --prefix server install
cd server && npx playwright install chromium
npm --prefix server run dev

npm --prefix web install
npm --prefix web run dev
```

可选：`HEADLESS=0` 弹出可视浏览器。

## 架构简述

- 前端：Vue 自定义 UI
- 后端：Hono BFF；Playwright 维持 WAF Cookie
- 业务：Node 密封后直调官网 `/contact-web`

## 注意

- 仅供个人自用；请遵守官网服务条款
- WAF / 会话过期后需重新验证码登录
