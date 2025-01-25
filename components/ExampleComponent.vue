<template>
  <div class="example-component">
    <h1>Hello from ExampleComponent!</h1>
    <p>This is a reusable component in your Nuxt application.</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ExampleComponent',
});
</script>

<style scoped>
.example-component {
  text-align: center;
  margin: 20px;
}
</style>