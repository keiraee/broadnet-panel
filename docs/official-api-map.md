# 10099 官网 API 地图

API 前缀：`baseUrl = "/contact-web"`  
`channelId`：`cd_20220516_093342`

## 短信登录

1. `GET /api/login/getImageCheckCode` — 图形验证码（binary）
2. `POST /api/login/getVerifyCode` — `{ recieveNum, channelId, type: 5 }`
3. `POST /api/login/gwLogin` — `{ channelId, loginPhone, loginPassWord, loginType: "5", channelType: "1", imageCheckCode }`

## 个人中心（需 sessionId）

| 用途 | API | 请求体要点 |
|---|---|---|
| 余额 | `POST /api/busi/qryBalanceFee` | `channelId, sessionId, accessNum`（金额多为分） |
| 余量 | `POST /api/busi/qryUserRes` | 同上（流量字段为 KB） |
| 账单 | `POST /api/busi/qryBillInfo` | 同上 |
| 套餐名 | `POST /api/busi/qryPhonePackInfo` | `channelId, sessionId` |

## 请求密封（见 `server/lib/broadnet-crypto.js`）

1. 追加 `v`、`timestamp`
2. `Access` = MD5(排序 key=value)
3. Body = `{ data: RSA-encryptLong(encodeURIComponent(JSON.stringify(payload))) }`
