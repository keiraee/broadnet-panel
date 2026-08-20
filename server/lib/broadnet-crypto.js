/**
 * Official 10099 request sealing (from common.js ajaxPrefilter).
 * Access = MD5(sorted key=value&...), body = { data: RSA-encryptLong(encodeURIComponent(JSON.stringify(payload))) }
 */
import crypto from 'node:crypto'

const APP_VERSION = '1.1.7.0915_release'

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4QJmWsYFtBbd/yoySbBAy7pB
bfrgHr2SGSOGoBukd65IUqQ9uWhvzCN9r0nWESIXWW6FR2A5adHUFFeETucXGjU61BZx
bLLf0ARL4F1NkkFMUF/D3GMY401+6TK8jVMxy4vLb6EKzlyZaI8jKBJ9jh0HMli6U7JH
ydsXstGRUnyx8Mu11bJ3+ZMUcKe51Zi+85Ez756EdZhGTXSY7pUAvh8/0Fea6mtsOs9O
LMHbGMKAOE0alN1QdfqE3QMKgB58MVwlPY7uljelSocjNxCIS58CLvu1iWFrLvsCp8t3
DavyA1OD/PPcXRrNLYZgzG5304/LAqfurOpU35AaB5tOnwIDAQAB
-----END PUBLIC KEY-----`

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDhAmZaxgW0Ft3/KjJJ
sEDLukFt+uAevZIZI4agG6R3rkhSpD25aG/MI32vSdYRIhdZboVHYDlp0dQUV4RO5xca
NTrUFnFsst/QBEvgXU2SQUxQX8PcYxjjTX7pMryNUzHLi8tvoQrOXJlojyMoEn2OHQcy
WLpTskfJ2xey0ZFSfLHwy7XVsnf5kxRwp7nVmL7zkTPvnoR1mEZNdJjulQC+Hz/QV5rq
a2w6z04swdsYwoA4TRqU3VB1+oTdAwqAHnwxXCU9ju6WN6VKhyM3EIhLnwIu+7WJYWsu
+wKny3cNq/IDU4P889xdGs0thmDMbnfTj8sCp+6s6lTfkBoHm06fAgMBAAECggEAdwFz
7TKqtZMamuhQbJTh0F6UWHzFqLyO1ujpPSkhlYMCEWN4meVYq9lhkiI1LB6hxtUjfJqy
AvvNdWzMN4cVuvDISoAMQXdh1H1RPDtc2avblu7vglKPSTkllGUXQI/t2D/5uvKr6nUj
Vh/OclVFPrKvqbsv4TB7s5FDOXqJp9v5jhJOs8fmS1eA5wL4SuvwfXqxVU+e7DCL21hW
ICLsFLpysvsmfcToPMZ9og7KZG4nHkEBMTZ6HVBS3RnayFcF6Q7kIqkKrIeIFb88R81P
nH1xXhBr9k7Mgm6l+wxtWRhhdQsjDY542c1Buh7eBcE7rdClUPucyyv3w9vKgDngIQKB
gQD6YcWcguASxL2IYSIdZNCqEey0I8MdPsJ5OfCrkrOQnEUCQCLEyZUcfGxr1+VsGvIf
NSLVLiZJVEvB7tsUb+OLmlElDycMfKzvAPEsbh/UKryeAZF4VJeNOeYuT10z2OMxsxh1
tmkOdobaK4eIUxr7CpUNa2v2DDYithB0GshzyQKBgQDmDuJve7+bFSbB6aZCuJFnIcF1
pgGR/jiTbMqJmvm8LVNpu8SQdd1fQX1/szOjtzfiXGWrlkBNQIlYOi2iWnyRBQYHXQej
i/zcCIJCTXDsEYtFj3A4ovJZUUZW7N0aUq7h+zQCWZ2H/Iq8SPeA1OnGJV78CAzLJ/kc
jZd4sgvTJwKBgGIBpW1nGTifhCT/CHCDBt6bV5EHspce+tai5F70dI81bBm+ax2mXlSh
K3tnLemL/pxSm0jg4KGxeln2GhE83s/FXt/nt3w+zR5cuwqOLK1K8TvUF1IHoq7oK/6S
mEP0MLJCjV9+QE8l/BEoGsw044nCkaeIFeFg1EvwAi7AURhpAoGASgJBz/F0a1R7mmgq
503u4MmYLdvQp4Gr+6lE4s2rR2Ehc2NHUd3I8GrmD527oBBB9x0YTAHS/8ciJ/LXWWJY
rmJ6VQYVfgR7vOEz3laBXEAsmJ0TUfUBl8Awq6gZXO16exJP4e2oYuXYT8f9b0GPTwIY
s2V3kCd02T2nm9lTOoMCgYB9sbBXCnnuht0TCA88cZtSKDRa1YtgdYCjSq6xClvhnKa1
bh+Ldfp5GVF4CLsEvgHgQS5QWh6pWO6wH0GOrr13SdgT50AwInmpdvqnD37kP1goyMtI
TiKxI6gNwbSsDMaGpJNSGzHFQR1Wy3iQ+r6XI/pSFZDhK6PFjUVVwbRFQw==
-----END PRIVATE KEY-----`

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]'
}

function isArray(v) {
  return Array.isArray(v)
}

/** Primitives that enter the Access signature string. */
function isSignablePrimitive(v) {
  return !isPlainObject(v) && !isArray(v) && v != null && v !== ''
}

/**
 * Sorted query-like string used for Access MD5 (mirrors common.js `u`).
 * Nested objects: one level of recursion with flatten.
 */
export function serializeForAccess(obj, nested = false) {
  if (!isPlainObject(obj)) return ''
  const keys = Object.keys(obj).sort()
  const parts = []
  for (const key of keys) {
    const val = obj[key]
    if (isPlainObject(val) && !nested) {
      parts.push(`${key}=${serializeForAccess(val, true)}`)
    } else if (isSignablePrimitive(val)) {
      parts.push(`${key}=${val}`)
    }
  }
  return parts.join('&')
}

function hex2b64(hex) {
  return Buffer.from(hex, 'hex').toString('base64')
}

function b64tohex(b64) {
  return Buffer.from(b64, 'base64').toString('hex')
}

function rsaEncryptChunk(plain) {
  const buf = crypto.publicEncrypt(
    {
      key: PUBLIC_KEY_PEM,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(plain, 'utf8'),
  )
  return buf.toString('hex')
}

function rsaDecryptChunk(hex) {
  const buf = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY_PEM,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(hex, 'hex'),
  )
  return buf.toString('utf8')
}

/** JSEncrypt-style encryptLong → base64 (byte-accurate port of common.js) */
export function encryptLong(text) {
  const keyBytes = 256 // 2048-bit RSA
  const max = keyBytes - 12
  let hex = ''
  let o = 0
  let a = 0
  let s = 0
  let c = 0
  const u = text.length

  for (let f = 0; f < u; f++) {
    const h = text.charCodeAt(f)
    s += h <= 127 ? 1 : h <= 2047 ? 2 : h <= 65535 ? 3 : 4
    if (s > max) {
      hex += rsaEncryptChunk(text.substring(o, a))
      o = a
      s -= c
    } else {
      a = f
      c = s
    }
  }
  hex += rsaEncryptChunk(text.substring(o, u))
  return hex2b64(hex)
}

/** JSEncrypt-style decryptLong */
export function decryptLong(b64) {
  try {
    const keyBytes = 256
    const hex = b64tohex(b64)
    const re = new RegExp(`.{1,${keyBytes * 2}}`, 'g')
    const parts = hex.match(re) || []
    return parts.map(rsaDecryptChunk).join('')
  } catch {
    return null
  }
}

/**
 * Seal a plaintext JSON body for /contact-web POST.
 * Mutates a shallow copy: adds v + timestamp.
 */
export function sealRequest(payload) {
  const data = { ...payload, v: APP_VERSION, timestamp: Date.now() }
  const signStr = serializeForAccess(data)
  const access = crypto.createHash('md5').update(signStr, 'utf8').digest('hex')
  const encoded = encodeURIComponent(JSON.stringify(data))
  const requestData = encryptLong(encoded)
  return {
    access,
    body: { data: requestData },
    signed: data,
    signStr,
  }
}

/** Unwrap response JSON; decrypt `{data:"..."}` envelopes when needed. */
export function openResponse(json) {
  if (!json || typeof json !== 'object') return json
  const keys = Object.keys(json)
  if (keys.length === 1 && keys[0] === 'data' && typeof json.data === 'string') {
    const plain = decryptLong(json.data)
    if (!plain) return json
    try {
      return JSON.parse(decodeURIComponent(plain))
    } catch {
      try {
        return JSON.parse(plain)
      } catch {
        return json
      }
    }
  }
  return json
}

export const CHANNEL_ID = process.env.BROADNET_CHANNEL_ID || 'cd_20220516_093342'
export const API_BASE = 'https://www.10099.com.cn/contact-web'
