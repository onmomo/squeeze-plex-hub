<template>
  <div>
    <header>
      <h1>My Nuxt App</h1>
    </header>
    <nuxt />
    <footer>
      <p>&copy; 2023 My Nuxt App</p>
    </footer>
  </div>
</template>

<script lang="ts">
export default {
  name: 'DefaultLayout',
}
</script>

<style scoped>
header {
  background-color: #f8f9fa;
  padding: 1rem;
  text-align: center;
}

footer {
  background-color: #f8f9fa;
  padding: 1rem;
  text-align: center;
}
</style>