<template>
  <div class="dashboard">
    <header class="master-unit">
      <div class="brand">
        <img src="/logo_512.png" alt="" class="brand-logo" />
        <div>
          <h1 class="brand-name">Squeeze Plex Hub</h1>
          <p class="brand-tagline">Manage the discovered Squeezebox players.</p>
        </div>
      </div>

      <div class="master-controls">
        <UColorModeButton color="neutral" variant="ghost" class="color-mode size-11 justify-center" />
        <div class="vfd" role="status" aria-live="polite">
          <template v-if="loading">
            <span class="vfd-scan">Scanning for Lyrion servers</span>
            <span class="vfd-cursor" aria-hidden="true" />
          </template>
          <template v-else>
            <span class="vfd-main"
              >{{ pad(stats.players - stats.hidden) }}<span class="vfd-of">/{{ pad(stats.players) }}</span></span
            >
            <span class="vfd-caption">
              <span>Players in Plexamp</span>
              <span class="vfd-sub">{{ stats.servers }} {{ stats.servers === 1 ? 'server' : 'servers' }}</span>
            </span>
          </template>
        </div>
      </div>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Can't load players from the hub"
      description="Check that Squeeze Plex Hub is still running. The list refreshes automatically once it responds."
      class="mb-6"
    />

    <div v-if="loading" class="scanning">
      <div class="sweep" aria-hidden="true" />
      <p>Looking for Lyrion Music Servers and their players on your network. This usually takes a few seconds.</p>
      <p class="scanning-hint">Nothing after a minute? Check that Lyrion is running on the same network and its CLI is enabled.</p>
    </div>

    <div v-else class="rack">
      <ServerSection v-for="section in sections" :key="section.server.uuid" :section="section" @update:hidden="setHidden" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { sections, stats, loading, error, setHidden } = usePlayerDashboard()

const pad = (value: number) => value.toString().padStart(2, '0')
</script>

<style scoped>
.dashboard {
  width: 100%;
  max-width: 76rem;
  margin: 0 auto;
}

.master-unit {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem 2rem;
  margin-bottom: 2rem;
  /* Same side padding as the rack units, so the readouts line up on the right */
  padding: 1.25rem 1.75rem;
  background: var(--rack-faceplate-sheen), var(--rack-faceplate);
  border: 1px solid var(--rack-edge);
  border-radius: 0.5rem;
  box-shadow:
    inset 0 1px 0 var(--rack-edge-highlight),
    0 6px 18px rgba(0, 0, 0, 0.35);
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.brand-logo {
  width: 3.5rem;
  height: 3.5rem;
  object-fit: contain;
}

.brand-name {
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 2.4vw, 1.5rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--rack-engrave);
}

.brand-tagline {
  margin-top: 0.125rem;
  font-size: 0.9rem;
  color: var(--rack-engrave-muted);
}

.master-controls {
  /* Stays on the right when the header wraps on narrow screens */
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Vacuum fluorescent display: amber digits on smoked glass */
.vfd {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.25rem;
  padding: 0.5rem 1rem;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  line-height: 1.2;
  color: var(--readout-amber);
  background: var(--readout-bg);
  border: 1px solid var(--readout-edge);
  border-radius: 0.375rem;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.9);
  text-shadow: 0 0 8px rgba(255, 167, 38, 0.5);
}

.vfd-main {
  font-size: 1.9rem;
  line-height: 1;
}

.vfd-of {
  font-size: 1.1rem;
  opacity: 0.6;
}

.vfd-caption {
  display: grid;
  font-size: 0.75rem;
  line-height: 1.35;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--readout-text);
  text-shadow: 0 0 6px rgba(130, 200, 190, 0.35);
}

.vfd-sub {
  color: var(--readout-dim);
}

.vfd-scan {
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.vfd-cursor {
  display: inline-block;
  width: 0.6rem;
  height: 1rem;
  background: var(--readout-amber);
  animation: blink 1s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.scanning {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--rack-engrave);
}

.scanning-hint {
  font-size: 0.875rem;
  color: var(--rack-engrave-muted);
}

/* Motion-tracker sweep while scanning */
.sweep {
  position: relative;
  width: 7rem;
  height: 7rem;
  margin-bottom: 0.5rem;
  border-radius: 9999px;
  background:
    repeating-radial-gradient(circle, transparent 0 1.1rem, rgba(130, 200, 190, 0.25) 1.1rem calc(1.1rem + 1px)), var(--readout-bg);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.9);
  overflow: hidden;
}

.sweep::after {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(from 0deg, rgba(130, 200, 190, 0.55), transparent 25%);
  animation: sweep 2.4s linear infinite;
}

@keyframes sweep {
  to {
    transform: rotate(360deg);
  }
}

.rack {
  display: grid;
  gap: 1.5rem;
}

@media (max-width: 640px) {
  .master-unit {
    padding: 1rem;
  }

  /* Phones: color mode in the top right corner, the readout gets its own row */
  .brand {
    padding-right: 2.5rem;
  }

  .color-mode {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .vfd {
    font-size: 1.1rem;
  }
}
</style>
