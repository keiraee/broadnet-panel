<script setup lang="ts">
defineProps<{
  tone?: 'ok' | 'warn' | 'info' | 'err' | 'idle'
  label: string
}>()
</script>

<template>
  <span class="t-led" :data-tone="tone || 'idle'">{{ label }}</span>
</template>
