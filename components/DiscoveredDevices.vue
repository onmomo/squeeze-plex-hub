<template>
  <div class="player-info-stage">
    <h1>Discovered LMS and Squeeze Players</h1>
    <p></p>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner" />
      <p>Loading devices...</p>      
    </div>

    <!-- Error State -->
    <div v-else-if="error">
      <p class="error">Failed to resolve discovered squeeze players. Please reload page and try again.</p>
    </div>

    <div v-for="player in players" :key="player.serverId" class="player-info">
      <p><strong>LMS: </strong>{{ player.serverId }}</p>
      <p><strong>Player: </strong>{{ player.playerInfo.name }} ({{ player.playerInfo.playerid }})</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import type { PlayerInfoWithServerId } from '~/server/composables/usePlayers'

export default defineComponent({
  name: 'DiscoveredDevices',
  setup() {
    const players = ref<PlayerInfoWithServerId[] | null>(null)
    const success = ref(false)
    const loading = ref(true)
    const error = ref(false)
    let intervalId: ReturnType<typeof setInterval> | null = null

    const fetchPlayers = async () => {
      try {
        const response = await axios.get('/api/players')
        players.value = response.data.players
        if (players.value && players.value.length > 0) {
          success.value = true
          loading.value = false
        }
      } catch (err) {
        console.error('Error fetching discovered players:', err)
        error.value = true
        loading.value = false
      }
    }

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(fetchPlayers, 5000) // Poll every 5 seconds
      }
    }

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    onMounted(() => {
      fetchPlayers()
      startPolling()
    })
    onUnmounted(stopPolling)

    return {
      players,
      loading,
      error
    }
  }
})
</script>

<style scoped>
.player-info-stage {
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

.player-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  margin-top: 10px;
}
</style>
