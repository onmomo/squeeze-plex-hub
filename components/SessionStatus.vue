<template>
  <div class="session-status">
    <div v-if="serverInfo">
      <h2>Plex Server Info</h2>
      <p><strong>Name:</strong> {{ serverInfo.friendlyName }}</p>
      <p><strong>machineIdentifier:</strong> {{ serverInfo.machineIdentifier }}</p>
      <p><strong>platform:</strong> {{ serverInfo.platform }}</p>
      <p><strong>platform version:</strong> {{ serverInfo.platformVersion }}</p>
      <p><strong>myPlexSubscription:</strong> {{ serverInfo.myPlexSubscription }}</p>
      <p><strong>myPlexUsername:</strong> {{ serverInfo.myPlexUsername }}</p>
    </div>
    <button @click="deleteSession">Delete Session</button>
  </div>
</template>

<script lang="ts">
import { ref, onMounted, defineComponent } from 'vue'
import axios from 'axios'

interface ServerInfo {
  friendlyName: string
  machineIdentifier: string
  myPlexSubscription: boolean
  myPlexUsername: string
  platform: string
  platformVersion: string
}

export default defineComponent({
  setup() {
    const status = ref('')
    const serverInfo = ref<ServerInfo | null>(null)

    onMounted(async () => {
      const response = await axios.get('/api/auth/session')
      status.value = response.data.status
      serverInfo.value = response.data.serverInfo
    })

    const deleteSession = async () => {
      await axios.delete('/api/auth/session')
      status.value = 'unauthorized'
      // Force page reload to start pin auth flow
      window.location.reload()
    }

    return {
      status,
      serverInfo,
      deleteSession
    }
  }
})
</script>

<style scoped>
.session-status {
  text-align: center;
  margin: 20px auto;
  max-width: 500px;
  padding: 20px;
  border-radius: 10px;
  background: #1e1e1e;
  color: #fff;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);
}

button {
  color: #ff9800;
  background: none;
  border: 2px solid #ff9800;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
}

button:hover {
  background: #ff9800;
  color: #fff;
}

.error {
  color: #ff5252;
  font-weight: bold;
}

.success {
  color: #4caf50;
  font-weight: bold;
}
</style>
