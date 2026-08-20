<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import StatusLed from './StatusLed.vue'

defineProps<{
  accountLabel: string
  accountTone: 'ok' | 'warn' | 'info' | 'err' | 'idle'
  syncLabel: string
  syncTone: 'ok' | 'warn' | 'info' | 'err' | 'idle'
  /** e.g. 19:00:35 — shown as 上次更新 … */
  lastUpdate?: string
}>()

const now = ref('')
let clockTimer: number | undefined

function tick() {
  now.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

onMounted(() => {
  tick()
  clockTimer = window.setInterval(tick, 1000)
})

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
})
</script>

<template>
  <div class="t-shell">
    <header class="t-topbar">
      <div class="t-brand">中国广电</div>
      <div class="t-status-row">
        <StatusLed :tone="accountTone" :label="accountLabel" />
        <StatusLed :tone="syncTone" :label="syncLabel" />
        <StatusLed tone="info" :label="now || '--:--:--'" />
      </div>
    </header>
    <main class="t-main">
      <slot />
    </main>
    <footer class="t-footer">
      <span>上次更新 {{ lastUpdate || '—' }}</span>
    </footer>
  </div>
</template>
