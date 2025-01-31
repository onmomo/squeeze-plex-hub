<template>
  <div>
    <!--<h1>Welcome to Squeeze Plex Hub!</h1>-->
    <PlexPinAuth />
  </div>
</template>

<script lang="ts">
import PlexPinAuth from '@/components/PlexPinAuth.vue';

export default {
  components: {
    PlexPinAuth
  }
}
</script>

<style scoped>
h1 {
  color: #42b983;
}
</style>