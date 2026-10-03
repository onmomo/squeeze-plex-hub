<template>
  <UApp :toaster="{ position: isPhone ? 'top-center' : 'bottom-right' }">
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

// Toasts at the bottom would cover the player keys on phones
const isPhone = useMediaQuery('(max-width: 640px)')
</script>
