/**
 * Broadnet gateway: custom UI → sealed official /contact-web APIs.
 * Ephemeral Playwright only warms WAF cookies; crypto is done in Node.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  API_BASE,
  CHANNEL_ID,
  openResponse,
  sealRequest,
} from '../lib/broadnet-crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGIN_URL = 'https://www.10099.com.cn/login.html'
const PERSONAL_URL = 'https://www.10099.com.cn/personal-center-number-order.html'
const ORIGIN = 'https://www.10099.com.cn'

function profileDir() {
  return (
    process.env.BROWSER_PROFILE ||
    path.join(__dirname, '..', 'data', 'browser-profile')
  )
}

function storagePath() {
  return path.join(profileDir(), 'storage.json')
}

function metaPath() {
  return path.join(profileDir(), 'meta.json')
}

/** Official traffic fields are KB. */
function kbToG(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round((n / 1024 / 1024) * 100) / 100
}

/** Balance fee fields are often in fen (分). */
function fenToYuan(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n) / 100
}

export class BroadnetGateway {
  constructor() {
    this.loggedIn = false
    this.phone = ''
    this.sessionId = ''
    this.lastAccount = null
    this.lastError = ''
    this._lock = Promise.resolve()
    /** @type {null | { browser, context, page, at: number }} */
    this._session = null
    this._loadMeta()
  }

  _loadMeta() {
    try {
      const p = metaPath()
      if (!fs.existsSync(p)) return
      const m = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (m.sessionId) this.sessionId = String(m.sessionId)
      if (m.phone) this.phone = String(m.phone)
      if (m.loggedIn && m.sessionId) this.loggedIn = true
      if (m.lastAccount) this.lastAccount = m.lastAccount
    } catch {
      /* ignore */
    }
  }

  _saveMeta() {
    try {
      fs.mkdirSync(profileDir(), { recursive: true })
      fs.writeFileSync(
        metaPath(),
        JSON.stringify(
          {
            loggedIn: this.loggedIn,
            phone: this.phone,
            sessionId: this.sessionId,
            lastAccount: this.lastAccount,
            savedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      )
    } catch {
      /* ignore */
    }
  }

  withLock(fn) {
    const run = this._lock.then(fn, fn)
    this._lock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async ensureSession() {
    if (this._session) {
      // reuse up to 8 minutes (captcha + sms window)
      if (Date.now() - this._session.at < 8 * 60 * 1000) return this._session
      await this.dropSession()
    }
    fs.mkdirSync(profileDir(), { recursive: true })
    const headless = process.env.HEADLESS !== '0'
    console.log('[gateway] open ephemeral browser')
    const browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--mute-audio',
        '--no-first-run',
      ],
    })
    const opts = {
      locale: 'zh-CN',
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    }
    const sp = storagePath()
    if (fs.existsSync(sp)) opts.storageState = sp
    const context = await browser.newContext(opts)
    const page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(800)
    this._session = { browser, context, page, at: Date.now() }
    return this._session
  }

  async dropSession() {
    const session = this._session
    this._session = null
    if (!session) return
    try {
      await session.context.storageState({ path: storagePath() })
    } catch {
      /* ignore */
    }
    try {
      await session.context.close()
    } catch {
      /* ignore */
    }
    try {
      await session.browser.close()
    } catch {
      /* ignore */
    }
  }

  async apiPost(context, apiPath, payload, referer = LOGIN_URL) {
    const { access, body } = sealRequest(payload)
    const res = await context.request.post(`${API_BASE}${apiPath}`, {
      headers: {
        Access: access,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer,
        Origin: ORIGIN,
      },
      data: body,
      timeout: 45000,
    })
    const status = res.status()
    const text = await res.text()
    let json = null
    try {
      json = openResponse(JSON.parse(text))
    } catch {
      json = null
    }
    return { ok: res.ok(), status, text, json }
  }

  async init() {
    fs.mkdirSync(profileDir(), { recursive: true })
    console.log('[gateway] crypto-api ready (ephemeral browser)')
    return { ok: true, mode: 'crypto-api' }
  }

  async refreshCaptchaImage() {
    return this.withLock(async () => {
      // new captcha ⇒ prefer fresh session cookies for image binding
      await this.dropSession()
      const { context } = await this.ensureSession()
      const res = await context.request.get(`${API_BASE}/api/login/getImageCheckCode`, {
        headers: { Accept: 'image/*,*/*', Referer: LOGIN_URL },
        timeout: 30000,
      })
      if (!res.ok()) throw new Error(`captcha HTTP ${res.status()}`)
      const buf = Buffer.from(await res.body())
      const ctype = res.headers()['content-type'] || 'image/jpeg'
      if (ctype.includes('text/html') || buf.length < 100) {
        throw new Error('captcha image failed (WAF challenge?)')
      }
      return {
        image: `data:${ctype};base64,${buf.toString('base64')}`,
        hint: '官方图形验证码 · 点击刷新',
      }
    })
  }

  async sendSms(phone, captcha) {
    return this.withLock(async () => {
      if (!/^1\d{10}$/.test(phone)) throw new Error('invalid phone')
      if (!captcha) throw new Error('captcha required')

      const { context } = await this.ensureSession()
      const result = await this.apiPost(context, '/api/login/getVerifyCode', {
        recieveNum: phone,
        channelId: CHANNEL_ID,
        type: 5,
      })
      const j = result.json
      if (j && (j.ok === true || j.status === '000000')) {
        this.phone = phone
        const msg =
          (typeof j.data === 'string' ? j.data : j.data?.respDesc) ||
          j.message ||
          '短信发送成功'
        return { ok: true, message: msg }
      }
      throw new Error(
        j?.message ||
          j?.data?.respDesc ||
          result.text?.slice(0, 200) ||
          `sms HTTP ${result.status}`,
      )
    })
  }

  async login(phone, smsCode, captcha) {
    return this.withLock(async () => {
      if (!/^1\d{10}$/.test(phone)) throw new Error('invalid phone')
      if (!smsCode) throw new Error('sms code required')
      if (!captcha) throw new Error('captcha required')

      const session = await this.ensureSession()
      try {
        const result = await this.apiPost(session.context, '/api/login/gwLogin', {
          channelId: CHANNEL_ID,
          loginPhone: phone,
          loginPassWord: smsCode,
          loginType: '5',
          channelType: '1',
          imageCheckCode: captcha,
        })

        const j = result.json
        console.log(
          '[gateway] gwLogin status',
          result.status,
          j ? { status: j.status, ok: j.ok, keys: Object.keys(j), msg: j.message } : result.text?.slice(0, 120),
        )

        const sessionId =
          j?.sessionId ||
          j?.data?.sessionId ||
          j?.data?.intfResultBean?.sessionId ||
          ''
        const phoneInfo = j?.phoneInfo || j?.data?.phoneInfo || null
        const ok =
          j &&
          (j.ok === true ||
            j.status === '000000' ||
            !!sessionId ||
            !!phoneInfo)

        if (!ok) {
          throw new Error(
            j?.message ||
              j?.data?.respDesc ||
              j?.respDesc ||
              result.text?.slice(0, 300) ||
              `gwLogin HTTP ${result.status}`,
          )
        }

        this.phone = phoneInfo?.accessNumber || phone
        this.sessionId = sessionId || this.sessionId
        this.loggedIn = true
        this.lastError = ''
        this._saveMeta()

        if (!this.sessionId) {
          console.warn('[gateway] gwLogin ok but no sessionId in response — account APIs may fail')
        }

        let account = null
        try {
          account = await this.fetchAccountWith(session)
          this.lastAccount = account
          this.phone = account.phone || this.phone
        } catch (e) {
          // Login itself succeeded — do NOT clear loggedIn (dashboard redirects on false)
          this.lastError = String(e.message || e)
          console.warn('[gateway] post-login account fetch failed:', this.lastError)
          account = {
            phone: this.phone,
            packageName: '',
            balance: 0,
            monthSpend: 0,
            cashBalance: 0,
            giftBalance: 0,
            quotas: [],
            extras: [],
            updatedAt: new Date().toISOString(),
            source: 'login-only',
            note: this.lastError,
          }
          this.lastAccount = account
          this.loggedIn = true
        }
        this._saveMeta()

        return { ok: true, phone: this.phone, account, sessionId: this.sessionId, raw: j }
      } finally {
        try {
          await session.context.storageState({ path: storagePath() })
        } catch {
          /* ignore */
        }
      }
    })
  }

  async fetchAccount() {
    return this.withLock(async () => {
      const session = await this.ensureSession()
      return await this.fetchAccountWith(session)
    })
  }

  async fetchAccountWith(session) {
    if (!this.sessionId) {
      throw new Error('missing sessionId — please login again')
    }

    const body = {
      channelId: CHANNEL_ID,
      sessionId: this.sessionId,
      accessNum: this.phone,
    }

    const [bal, res, bill, pack] = await Promise.all([
      this.apiPost(session.context, '/api/busi/qryBalanceFee', body, PERSONAL_URL).catch((e) => ({
        error: String(e.message || e),
      })),
      this.apiPost(session.context, '/api/busi/qryUserRes', body, PERSONAL_URL).catch((e) => ({
        error: String(e.message || e),
      })),
      this.apiPost(session.context, '/api/busi/qryBillInfo', body, PERSONAL_URL).catch((e) => ({
        error: String(e.message || e),
      })),
      this.apiPost(
        session.context,
        '/api/busi/qryPhonePackInfo',
        { channelId: CHANNEL_ID, sessionId: this.sessionId },
        PERSONAL_URL,
      ).catch((e) => ({ error: String(e.message || e) })),
    ])

    // auth lost markers from official dataFilter / status codes
    for (const r of [bal, res, bill, pack]) {
      const st = r?.json?.status
      if (st === '701' || st === 701) {
        this.loggedIn = false
        this.sessionId = ''
        this._saveMeta()
        throw new Error('session expired — please login again')
      }
    }

    const apiAccount = this._accountFromApis({ bal, res, bill, pack, phone: this.phone })
    if (apiAccount) {
      this.loggedIn = true
      this.lastAccount = apiAccount
      this.lastError = ''
      this._saveMeta()
      return apiAccount
    }

    const detail = [bal, res, bill, pack]
      .map((x) => x?.json?.message || x?.error || x?.json?.status || '')
      .filter(Boolean)
      .join(' | ')
    throw new Error(detail || 'account APIs returned empty')
  }

  _accountFromApis({ bal, res, bill, pack, phone }) {
    const bj = bal?.json
    const rj = res?.json
    const billj = bill?.json
    const pj = pack?.json
    if (![bj, rj, billj, pj].some((x) => x && (x.ok || x.status === '000000' || x.data))) {
      return null
    }

    const beanBal = bj?.data?.intfResultBean || bj?.data || {}
    const beanRes = rj?.data?.intfResultBean || rj?.data || {}
    const dataBill = billj?.data || {}
    const dataPack = pj?.data || {}

    // qryBalanceFee: fen; qryBillInfo: yuan strings
    let balance = fenToYuan(beanBal.balance)
    let monthSpend = fenToYuan(beanBal.currealFee)
    if (!Number.isFinite(balance) && dataBill.balance != null) balance = Number(dataBill.balance)
    if (!Number.isFinite(monthSpend)) {
      const spendItem = (dataBill.contentList || [])
        .flatMap((g) => g.list || [])
        .find((i) => /消费合计|当月消费/.test(i.name || ''))
      monthSpend = spendItem ? Number(spendItem.value) : NaN
    }

    let cashBalance = balance
    let giftBalance = 0
    const balList = (dataBill.contentList || []).find((g) => /账户余额/.test(g.title || ''))
    if (balList?.list) {
      const cash = balList.list.find((i) => /现金/.test(i.name || ''))
      const gift = balList.list.find((i) => /赠/.test(i.name || ''))
      if (cash) cashBalance = Number(cash.value)
      if (gift) giftBalance = Number(gift.value)
    }

    const quotas = []
    const list = beanRes.userResList || beanRes.resList || []
    if (Array.isArray(list)) {
      for (const item of list) {
        const total = kbToG(item.highFee)
        const remain = kbToG(item.balance)
        const used = kbToG(item.addupValue)
        // skip fully empty exhausted free leftovers clutter? keep all with total>0
        if (!total && !used && !remain) continue
        quotas.push({
          name: item.itemName || item.discntName || item.itemTypeDesc || '资源',
          used,
          remain,
          total: total || used + remain,
          unit: 'G',
          tag: item.itemTypeDesc || undefined,
        })
      }
    }

    const extras = []
    const ext = beanRes.userExtResList || []
    if (Array.isArray(ext)) {
      for (const item of ext) {
        const fee = fenToYuan(item.extDiscntFee)
        const usageG = kbToG(item.extTotalValue)
        if (!fee && !usageG) continue
        extras.push({
          name: '套外国内流量',
          usage: `${usageG} G`,
          fee: Number.isFinite(fee) ? fee : 0,
        })
      }
    }

    const packageName = dataPack.packName || dataPack.offerName || dataPack.cxPackName || ''

    if (
      !Number.isFinite(balance) &&
      !Number.isFinite(monthSpend) &&
      !quotas.length &&
      !packageName
    ) {
      return null
    }

    return {
      phone: phone || this.phone,
      packageName,
      balance: Number.isFinite(balance) ? balance : 0,
      monthSpend: Number.isFinite(monthSpend) ? monthSpend : 0,
      cashBalance: Number.isFinite(cashBalance) ? cashBalance : 0,
      giftBalance: Number.isFinite(giftBalance) ? giftBalance : 0,
      quotas,
      extras,
      updatedAt: new Date().toISOString(),
      source: 'api',
    }
  }

  async keepalive() {
    try {
      if (!this.loggedIn && !this.lastAccount) return { ok: false, reason: 'not logged in' }
      await this.fetchAccount()
      return { ok: true }
    } catch (e) {
      this.lastError = String(e.message || e)
      if (/session expired|未登录|登录|missing sessionId/i.test(this.lastError)) {
        this.loggedIn = false
      }
      return { ok: false, reason: this.lastError }
    }
  }

  status() {
    return {
      loggedIn: this.loggedIn,
      phone: this.phone,
      hasSessionId: !!this.sessionId,
      lastError: this.lastError,
      hasCache: !!this.lastAccount,
      updatedAt: this.lastAccount?.updatedAt || null,
      mode: 'crypto-api',
    }
  }

  async close() {
    await this.dropSession()
  }
}

export const gateway = new BroadnetGateway()
