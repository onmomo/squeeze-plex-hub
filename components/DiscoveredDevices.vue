<template>
  <div class="player-info-stage">
    <h1 class="title">Discovered Squeezebox Players</h1>
    <p v-if="!loading">Manage and control your Squeezebox Players seamlessly with Plexamp.</p>

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
        <h2 v-if="group.length > 0">{{ group[0].serverInfo.name }} ({{ group[0].serverInfo.ip }}) - {{ group.length }} player(s) found</h2>
        <p v-else>LMS ID: {{ serverId }} - No players found 😞</p>
        <div v-for="player in group" :key="player.playerInfo.playerid" class="player-card">
          <div class="card-content">
            <p>
              <strong>{{ player.playerInfo.name }} ({{ player.playerInfo.playerid }})</strong>
            </p>
            <p>v{{ player.playerInfo.firmware }}</p>
            <img
              :src="`http://${player.serverInfo.ip}:${player.serverInfo.jsonPort}/html/images/Players/${player.playerInfo.model}_250x250.png`"
              :alt="`Player Model: ${player.playerInfo.model}`"
              class="player-image"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import type { PlayerServerInfo } from '~/server/routes/api/players.get'

export default defineComponent({
  name: 'DiscoveredDevices',
  setup() {
    const players = ref<PlayerServerInfo[] | null>(null)
    const success = ref(false)
    const loading = ref(true)
    const error = ref(false)
    let intervalId: ReturnType<typeof setInterval> | null = null

    const fetchPlayers = async () => {
      try {
        const response = await axios.get('/api/players')
        players.value = response.data
        if (players.value && players.value.length > 0) {
          success.value = true
          loading.value = false
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (err.response && err.response.status === 404) {
            console.warn('No players found, staying in loading state.')
          }
        } else {
          console.error('Error fetching discovered players:', err)
          error.value = true
          loading.value = false
        }
      }
    }

    const groupedPlayers = computed(() => {
      if (!players.value) return {}
      return players.value.reduce(
        (acc, player) => {
          const serverId = player.serverInfo.uuid
          if (!acc[serverId]) {
            acc[serverId] = []
          }
          acc[serverId].push(player)
          return acc
        },
        {} as Record<string, PlayerServerInfo[]>
      )
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

.player-info-stage {
  text-align: center;
  margin: 20px auto;
  max-width: 700px;
  padding: 20px;
  border-radius: 20px;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.4);
}

.server-group {
  color: rgb(130, 200, 190); /* Green */
  padding: 20px;
  margin: 20px 30px;
  background: #1e1e1e;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

.player-card {
  background: #ff9800;
  color: #000;
  border-radius: 30px;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
  margin: 20px auto;
  padding: 25px;
  max-width: 400px;
  text-align: center;
}

.player-image {
  padding: 20px;
}

.card-content {
  display: flex;
  flex-direction: column;
}

.card-content p {
  margin: 5px 0;
}

.title {  
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 10px;
}
</style>
