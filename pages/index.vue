<template>
  <div>
    <PlexPinAuth v-if="!isSessionActive" />
    <SessionStatus v-else />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue'
import axios from 'axios'
import PlexPinAuth from '@/components/PlexPinAuth.vue'
import SessionStatus from '@/components/SessionStatus.vue'

export default defineComponent({
  components: {
    PlexPinAuth,
    SessionStatus
  },
  setup() {
    const isSessionActive = ref(false)

    onMounted(async () => {
      const response = await axios.get('/api/auth/session')
      isSessionActive.value = response.data.status === 'authorized'
    })

    return {
      isSessionActive
    }
  }
})
</script>

<style scoped>
h1 {
  color: #42b983;
}
</style>
