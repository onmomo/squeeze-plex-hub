<template>
  <div class="plex-pin-auth">
    <h1>Link Plex with Squeeze Plex Hub</h1>
    <p>
      Please enter the PIN shown below at
      <a href="https://plex.tv/pin" target="_blank">plex.tv/pin</a> to link your Plex Server.
    </p>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <p>Loading PIN...</p>
      <div class="spinner"/>
    </div>

    <!-- Error State -->
    <div v-else-if="error">
      <p class="error">Failed to verify PIN. Please reload page and try again.</p>
    </div>

    <!-- Success State -->
    <div v-else-if="success">
      <p class="success">Successfully linked Plex with Squeeze Plex Hub! ✅</p>
      <SessionStatus />
    </div>

    <!-- PIN Display -->
    <div v-else-if="pin" class="pin-container">
      <p><strong>PIN Code:</strong> {{ pin.code }}</p>
      <p><strong>PIN ID:</strong> {{ pin.id }}</p>
      <p>
        <a :href="'https://plex.tv/pin?pin=' + pin.code" target="_blank" class="link"> Click here to link Plex with Squeeze Plex Hub </a>
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

export default defineComponent({
  name: 'PlexPinAuth',
  setup() {    
    const pin = ref<{ code: string; id: string } | null>(null)
    const success = ref(false)
    const loading = ref(true)
    const error = ref(false)
    let intervalId: ReturnType<typeof setInterval> | null = null

    const fetchPin = async () => {
      try {
        const response = await axios.get('/api/auth/pin')
        pin.value = response.data
        loading.value = false
        startPolling()
      } catch (err) {
        console.error('Error fetching PIN:', err)
        error.value = true
        loading.value = false
      }
    }

    const checkPinAuth = async () => {
      if (!pin.value) return
      try {
        const response = await axios.get(`/api/auth/token?pinId=${pin.value.id}`)
        if (response.data.status === 'authorized') {
          success.value = true
          pin.value = null
          stopPolling()
        } else if (response.data.status === 'invalid') {
          pin.value = null
          error.value = true
          stopPolling()
        }
      } catch (err) {
        console.error('Error checking PIN auth:', err)
      }
    }

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(checkPinAuth, 5000) // Poll every 5 seconds
      }
    }

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    onMounted(fetchPin)
    onUnmounted(stopPolling)

    return {
      pin,
      success,
      loading,
      error
    }
  }
})
</script>

<style scoped>
.plex-pin-auth {
  text-align: center;
  margin: 20px auto;
  max-width: 500px;
  padding: 20px;
  border-radius: 10px;
  background: #1e1e1e;
  color: #fff;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
}

a {
  color: #ff9800;
  text-decoration: none;
  font-weight: bold;
}

a:hover {
  text-decoration: underline;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #ff9800;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-top: 10px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  color: #ff5252;
  font-weight: bold;
}

.success {
  color: #4caf50;
  font-weight: bold;
}

.pin-container {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  margin-top: 10px;
}
</style>
