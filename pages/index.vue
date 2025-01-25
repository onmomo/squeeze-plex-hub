<template>
  <div>
    <h1>Welcome to My Nuxt App</h1>
    <p>This is the homepage of your Nuxt application.</p>
    <ExampleComponent />
  </div>
</template>

<script lang="ts">
import ExampleComponent from '@/components/ExampleComponent.vue';

export default {
  components: {
    ExampleComponent
  }
}
</script>

<style scoped>
h1 {
  color: #42b983;
}
</style>