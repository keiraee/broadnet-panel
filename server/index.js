import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gateway } from './browser/gateway.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 9993)
const publicDir = path.join(__dirname, 'public')

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
  }),
)

function markLocalSession(c, phone) {
  setCookie(c, 'local_session', 'ok', {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  setCookie(c, 'local_phone', phone || '', {
    httpOnly: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

function clearLocalSession(c) {
  deleteCookie(c, 'local_session', { path: '/' })
  deleteCookie(c, 'local_phone', { path: '/' })
}

function requireLocal(c) {
  return gateway.loggedIn || getCookie(c, 'local_session') === 'ok'
}

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    port: PORT,
    gateway: gateway.status(),
  }),
)

app.get('/api/auth/captcha', async (c) => {
  try {
    await gateway.init()
    const data = await gateway.refreshCaptchaImage()
    return c.json(data)
  } catch (e) {
    return c.text(String(e.message || e), 500)
  }
})

app.post('/api/auth/sms', async (c) => {
  try {
    const body = await c.req.json()
    const phone = String(body.phone || '').trim()
    const captcha = String(body.captcha || '').trim()
    const res = await gateway.sendSms(phone, captcha)
    return c.json(res)
  } catch (e) {
    return c.text(String(e.message || e), 400)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const phone = String(body.phone || '').trim()
    const smsCode = String(body.smsCode || '').trim()
    const captcha = String(body.captcha || '').trim()
    const res = await gateway.login(phone, smsCode, captcha)
    markLocalSession(c, res.phone || phone)
    return c.json(res)
  } catch (e) {
    return c.text(String(e.message || e), 400)
  }
})

app.get('/api/auth/session', async (c) => {
  try {
    await gateway.init()
  } catch {
    /* ignore */
  }
  const loggedIn = !!gateway.loggedIn
  const phone = loggedIn ? gateway.phone || getCookie(c, 'local_phone') || '' : ''
  if (!loggedIn) clearLocalSession(c)
  return c.json({
    loggedIn,
    phone,
    session: loggedIn ? 'authenticated' : 'anonymous',
    gateway: gateway.status(),
  })
})

app.post('/api/auth/logout', async (c) => {
  clearLocalSession(c)
  gateway.loggedIn = false
  gateway.sessionId = ''
  gateway.lastAccount = null
  gateway._saveMeta()
  return c.json({ ok: true })
})

app.get('/api/account', async (c) => {
  if (!requireLocal(c)) return c.text('unauthorized', 401)
  try {
    const fresh =
      gateway.lastAccount?.updatedAt &&
      Date.now() - Date.parse(gateway.lastAccount.updatedAt) < 120_000
    if (gateway.lastAccount && (c.req.query('cache') === '1' || fresh)) {
      if (!fresh || c.req.query('refresh') === '1') {
        gateway.fetchAccount().catch(() => {})
      }
      return c.json(gateway.lastAccount)
    }
    const account = await gateway.fetchAccount()
    markLocalSession(c, account.phone)
    return c.json(account)
  } catch (e) {
    const msg = String(e.message || e)
    if (gateway.lastAccount) {
      return c.json({ ...gateway.lastAccount, stale: true, error: msg })
    }
    if (/session expired|login rejected|JSESSIONID|missing sessionId/i.test(msg)) {
      clearLocalSession(c)
      gateway.loggedIn = false
      return c.text(msg, 401)
    }
    return c.text(msg, 503)
  }
})

app.post('/api/account/refresh', async (c) => {
  if (!requireLocal(c)) return c.text('unauthorized', 401)
  try {
    const account = await gateway.fetchAccount()
    return c.json(account)
  } catch (e) {
    const msg = String(e.message || e)
    if (gateway.lastAccount) {
      return c.json({ ...gateway.lastAccount, stale: true, error: msg })
    }
    return c.text(msg, /session expired|missing sessionId/i.test(msg) ? 401 : 503)
  }
})

if (fs.existsSync(publicDir)) {
  app.use(
    '/*',
    serveStatic({
      root: publicDir,
      rewriteRequestPath: (p) => p,
    }),
  )
  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api')) return c.text('not found', 404)
    const index = path.join(publicDir, 'index.html')
    if (fs.existsSync(index)) return c.html(fs.readFileSync(index, 'utf8'))
    return c.text('ui not built', 404)
  })
}

const keepMs = Number(process.env.KEEPALIVE_MS || 10 * 60 * 1000)
if (keepMs > 0) {
  setInterval(() => {
    gateway.keepalive().then((r) => {
      console.log(`[keepalive] ${r.ok ? 'ok' : r.reason}`)
    })
  }, keepMs)
}

console.log(`broadnet-panel http://0.0.0.0:${PORT}`)
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' })

gateway.init().catch((e) => {
  console.error('[gateway] init failed (will retry on demand):', e.message || e)
})
