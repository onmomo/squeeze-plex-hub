<template>
  <div class="page">
    <main>
      <PlayerDashboard />
    </main>
    <footer class="page-foot">
      <a href="https://github.com/onmomo/squeeze-plex-hub" target="_blank" rel="noopener noreferrer">Squeeze Plex Hub on GitHub</a>
    </footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
}

main {
  flex: 1;
}

.page-foot {
  margin-top: 3rem;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.page-foot a {
  color: var(--rack-engrave-muted);
  text-decoration: none;
}

.page-foot a:hover,
.page-foot a:focus-visible {
  color: var(--color-squeeze-400);
  text-decoration: underline;
}
</style>
