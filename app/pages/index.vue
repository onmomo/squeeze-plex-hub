<template>
  <div>
    <header>
      <img src="/logo_512.png" alt="Squeeze Plex Hub" >      
    </header>
    <main>
      <DiscoveredDevices />
    </main>
    <footer>
      <p>Visit <a href="https://github.com/onmomo/squeeze-plex-hub">Squeeze Plex Hub</a></p>
    </footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import DiscoveredDevices from '@/components/DiscoveredDevices.vue'

export default defineComponent({
  components: {
    DiscoveredDevices: DiscoveredDevices,
  },
})
</script>

<style scoped>

header {  
  text-align: center;
  margin: 20px 0;
  padding: 20px;
  background-color: white;
  color: rgb(130, 200, 190); /* Green */
  border-radius: 8px;
  font-size: 2rem; /* Bigger text */
  font-weight: bold; /* More bold */ 

  img {
    display: block; margin: 0 auto;
    max-height: 130px;
  }
}

footer {
  text-align: center;
  margin-top: 40px;
  padding: 20px;
  background: #000000; /* Black */
  color: #D3D3D3; /* Gray */
  border-radius: 8px;
}

footer a {  
  color: rgb(130, 200, 190); /* Green */
  text-decoration: none;
}

footer a:hover {
  text-decoration: underline;
}
</style>
