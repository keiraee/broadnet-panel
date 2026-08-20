<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import { getCaptcha, login, sendSms } from '../api/client'

const router = useRouter()
const phone = ref('')
const captcha = ref('')
const captchaImage = ref('')
const smsCode = ref('')
const busy = ref(false)
const smsSent = ref(false)
const message = ref('正在加载验证码…')
const messageTone = ref<'ok' | 'warn' | 'err' | 'idle'>('idle')

async function loadCaptcha() {
  try {
    const data = await getCaptcha()
    captchaImage.value = data.image || ''
    if (data.code && !data.image) {
      captchaImage.value = ''
      message.value = data.hint || '请输入验证码'
    } else {
      message.value = data.hint || '请输入图形验证码'
    }
    captcha.value = ''
    messageTone.value = 'idle'
  } catch (e) {
    captchaImage.value = ''
    message.value = e instanceof Error ? e.message : '验证码加载失败'
    messageTone.value = 'err'
  }
}

async function onSendSms() {
  busy.value = true
  try {
    const res = await sendSms(phone.value.trim(), captcha.value.trim())
    smsSent.value = true
    message.value = res.message
    messageTone.value = 'ok'
  } catch (e) {
    message.value = e instanceof Error ? e.message : '短信发送失败'
    messageTone.value = 'err'
    await loadCaptcha()
  } finally {
    busy.value = false
  }
}

async function onLogin() {
  busy.value = true
  message.value = '正在登录…'
  messageTone.value = 'idle'
  try {
    await login(phone.value.trim(), smsCode.value.trim(), captcha.value.trim())
    message.value = '登录成功'
    messageTone.value = 'ok'
    await router.push('/')
  } catch (e) {
    message.value = e instanceof Error ? e.message : '登录失败'
    messageTone.value = 'err'
    await loadCaptcha()
  } finally {
    busy.value = false
  }
}

onMounted(loadCaptcha)
</script>

<template>
  <AppShell
    account-label="未登录"
    account-tone="idle"
    sync-label="验证码就绪"
    sync-tone="info"
  >
    <div class="t-panel" style="max-width: 420px; margin: 40px auto">
      <div class="t-panel__head">
        <span class="t-panel__title">短信登录</span>
        <span>官方接口</span>
      </div>
      <div class="t-panel__body">
        <p class="t-hint" style="margin: 0 0 12px">
          使用手机号 + 图形验证码 + 短信验证码登录，会话保存在本地服务。
        </p>

        <div class="t-field">
          <label>手机号</label>
          <input v-model="phone" class="t-input" maxlength="11" placeholder="请输入 11 位手机号" />
        </div>

        <div class="t-field">
          <label>图形验证码</label>
          <div class="t-row">
            <input
              v-model="captcha"
              class="t-input"
              maxlength="8"
              placeholder="请输入图形验证码"
              @keyup.enter="onSendSms"
            />
            <button
              type="button"
              class="t-captcha"
              title="刷新验证码"
              :style="captchaImage ? { padding: 0, overflow: 'hidden' } : undefined"
              @click="loadCaptcha"
            >
              <img
                v-if="captchaImage"
                :src="captchaImage"
                alt="验证码"
                style="height: 28px; display: block"
              />
              <span v-else>…</span>
            </button>
          </div>
        </div>

        <div class="t-field">
          <label>短信验证码</label>
          <div class="t-row">
            <input
              v-model="smsCode"
              class="t-input"
              maxlength="8"
              placeholder="请输入短信验证码"
              @keyup.enter="onLogin"
            />
            <button type="button" class="t-btn" :disabled="busy" @click="onSendSms">发短信</button>
          </div>
        </div>

        <div class="t-row" style="margin-top: 4px">
          <button
            type="button"
            class="t-btn t-btn--primary"
            style="flex: 1"
            :disabled="busy || !smsSent"
            @click="onLogin"
          >
            登录
          </button>
        </div>

        <p
          class="t-hint"
          style="margin: 12px 0 0"
          :style="{
            color:
              messageTone === 'err'
                ? 'var(--status-err)'
                : messageTone === 'ok'
                  ? 'var(--accent-ink)'
                  : undefined,
          }"
        >
          {{ message }}
        </p>
      </div>
    </div>
  </AppShell>
</template>
