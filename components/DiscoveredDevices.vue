<template>
  <div class="player-info-stage">
    <h1>Discovered Squeezebox Players</h1>
    <p></p>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner" />
      <p>Loading devices...</p>      
    </div>

    <!-- Error State -->
    <div v-else-if="error">
      <p class="error">Failed to resolve discovered squeezebox players. Please reload page and try again.</p>
    </div>

    <!-- Players -->
    <div v-else>
      <div v-for="(group, serverId) in groupedPlayers" :key="serverId" class="server-group">
        <h2>LMS Server: {{ serverId }}</h2>
        <div v-for="player in group" :key="player.playerInfo.playerid" class="player-card">
          <div class="card-content">
            <p><strong>Player</strong></p>
            <p>{{ player.playerInfo.name }} ({{ player.playerInfo.playerid }})</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
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

    const groupedPlayers = computed(() => {
      if (!players.value) return {}
      return players.value.reduce((acc, player) => {
        const serverId = player.serverId
        if (!acc[serverId]) {
          acc[serverId] = []
        }
        acc[serverId].push(player)
        return acc
      }, {} as Record<string, PlayerInfoWithServerId[]>)
    })

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
      groupedPlayers,
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
  color: rgb(130, 200, 190); /* Green */
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
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

.server-group {
  margin: 20px 0;
}

.player-card {
  background: #ffffff;
  color: #000;
  border-radius: 8px;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
  margin: 10px auto;
  padding: 20px;
  max-width: 400px;
  text-align: left;
}

.card-content {
  display: flex;
  flex-direction: column;
}

.card-content p {
  margin: 5px 0;
}
</style>
