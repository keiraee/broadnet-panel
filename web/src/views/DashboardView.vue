<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import { getAccount, getSession, refreshAccount } from '../api/client'
import type { AccountSnapshot } from '../types'

type LedTone = 'ok' | 'warn' | 'info' | 'err' | 'idle'

const router = useRouter()
const data = ref<AccountSnapshot | null>(null)
const error = ref('')
const lastSync = ref('')
const syncOk = ref(false)
let timer: number | undefined

const accountTone = computed<LedTone>(() => (data.value ? 'ok' : 'warn'))
const syncTone = computed<LedTone>(() => (syncOk.value ? 'ok' : 'warn'))

const accountLabel = computed(() => {
  if (!data.value?.phone) return '加载中'
  const digits = data.value.phone.replace(/\D/g, '')
  return digits ? `尾号 ${digits.slice(-4)}` : '已登录'
})

const syncLabel = computed(() => {
  if (!lastSync.value) return '同步中…'
  return syncOk.value ? `已同步 ${lastSync.value}` : `同步失败 ${lastSync.value}`
})

function pct(used: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

function barTone(used: number, total: number) {
  const p = pct(used, total)
  if (p >= 95) return 'err'
  if (p >= 80) return 'warn'
  return 'ok'
}

function stamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function load() {
  try {
    const session = await getSession()
    if (!session.loggedIn) {
      await router.replace('/login')
      return
    }
    data.value = await getAccount()
    syncOk.value = true
    error.value = ''
    lastSync.value = stamp()
  } catch (e) {
    const msg = e instanceof Error ? e.message : '同步失败'
    error.value = msg
    syncOk.value = false
    lastSync.value = stamp()
    if (/unauthorized|session expired/i.test(msg)) {
      await router.replace('/login')
    }
  }
}

async function onRefresh() {
  try {
    data.value = await refreshAccount()
    syncOk.value = true
    lastSync.value = stamp()
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '刷新失败'
    syncOk.value = false
    lastSync.value = stamp()
  }
}

onMounted(async () => {
  await load()
  timer = window.setInterval(load, 30_000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <AppShell
    :account-label="accountLabel"
    :account-tone="accountTone"
    :sync-label="syncLabel"
    :sync-tone="syncTone"
    :last-update="lastSync || undefined"
  >
    <div v-if="error" class="t-panel">
      <div class="t-panel__head">
        <span class="t-panel__title">提示</span>
        <span class="t-led" data-tone="err">异常</span>
      </div>
      <div class="t-panel__body">{{ error }}</div>
    </div>

    <template v-if="data">
      <div class="t-panel">
        <div class="t-panel__head">
          <span class="t-panel__title">我的账户 · {{ data.phone }}</span>
          <div class="t-row">
            <span>{{ data.packageName }}</span>
            <button type="button" class="t-btn" @click="onRefresh">刷新</button>
          </div>
        </div>
        <div class="t-panel__body">
          <div class="t-grid t-grid-2">
            <div class="t-stat">
              <div class="t-stat__label">话费余额</div>
              <div class="t-stat__value">
                {{ data.balance.toFixed(2) }}<small>元</small>
              </div>
            </div>
            <div class="t-stat">
              <div class="t-stat__label">当月消费</div>
              <div class="t-stat__value">
                {{ data.monthSpend.toFixed(2) }}<small>元</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="t-grid t-grid-2">
        <div class="t-panel">
          <div class="t-panel__head">
            <span class="t-panel__title">充话费</span>
          </div>
          <div class="t-panel__body">
            <div class="t-field">
              <label>充值号码</label>
              <input class="t-input" :value="data.phone" readonly />
            </div>
            <p class="t-hint">充值将跳转官网收银台（后续接入）</p>
          </div>
        </div>

        <div class="t-panel">
          <div class="t-panel__head">
            <span class="t-panel__title">账户余额</span>
          </div>
          <div class="t-panel__body">
            <div class="t-quota">
              <div class="t-quota__top">
                <span class="t-quota__name">现金余额</span>
                <span class="t-quota__nums">{{ data.cashBalance.toFixed(2) }} 元</span>
              </div>
            </div>
            <div class="t-quota">
              <div class="t-quota__top">
                <span class="t-quota__name">赠金余额</span>
                <span class="t-quota__nums">{{ data.giftBalance.toFixed(2) }} 元</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="t-panel">
        <div class="t-panel__head">
          <span class="t-panel__title">套餐余量</span>
          <span>{{ data.quotas.length }} 项</span>
        </div>
        <div class="t-panel__body">
          <div v-for="(q, i) in data.quotas" :key="i" class="t-quota">
            <div class="t-quota__top">
              <span class="t-quota__name">
                <template v-if="q.tag">【{{ q.tag }}】</template>{{ q.name }}已用
                {{ q.used.toFixed(2) }} {{ q.unit }}
              </span>
              <span class="t-quota__nums">
                剩余 {{ q.remain.toFixed(2) }} {{ q.unit }} / 共 {{ q.total.toFixed(2) }}
                {{ q.unit }}
              </span>
            </div>
            <div
              class="t-bar"
              :data-tone="barTone(q.used, q.total)"
              :style="{ '--pct': pct(q.used, q.total) + '%' }"
            >
              <i />
            </div>
          </div>
        </div>
      </div>

      <div class="t-panel">
        <div class="t-panel__head">
          <span class="t-panel__title">套餐外计费</span>
          <span class="t-led" :data-tone="data.extras.length ? 'warn' : 'ok'">
            {{ data.extras.length ? '有费用' : '无费用' }}
          </span>
        </div>
        <div class="t-panel__body" style="padding: 0">
          <table class="t-table">
            <thead>
              <tr>
                <th>资源名称</th>
                <th>资源使用量</th>
                <th>套外费用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in data.extras" :key="i">
                <td>{{ row.name }}</td>
                <td>{{ row.usage }}</td>
                <td>{{ row.fee.toFixed(2) }} 元</td>
              </tr>
              <tr v-if="!data.extras.length">
                <td colspan="3" style="color: var(--text-dim)">暂无费用</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </AppShell>
</template>
