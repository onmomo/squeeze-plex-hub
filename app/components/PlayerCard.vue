<template>
  <article class="channel" :class="{ 'is-standby': player.hidden }" :aria-label="`${player.name}, ${player.modelName}`">
    <header class="channel-head">
      <span class="channel-model">
        <span class="channel-model-name" :title="player.modelName">{{ player.modelName }}</span>
        <span v-if="player.hidden" class="channel-state">Hidden</span>
      </span>
      <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          class="size-11 justify-center -mr-2"
          :aria-label="`Options for ${player.name}`"
        />
      </UDropdownMenu>
    </header>

    <div class="bezel">
      <UIcon v-if="!imageLoaded" name="i-lucide-speaker" class="bezel-icon" aria-hidden="true" />
      <img
        v-if="!imageFailed"
        v-show="imageLoaded"
        :src="player.imageUrl"
        :alt="`${player.modelName} player`"
        class="bezel-image"
        @load="imageLoaded = true"
        @error="imageFailed = true"
      />
    </div>

    <h3 class="channel-name" :title="player.name">{{ player.name }}</h3>

    <dl class="readout">
      <div>
        <dt>IP</dt>
        <dd>{{ player.ip }}</dd>
      </div>
      <div>
        <dt>ID</dt>
        <dd>{{ player.id }}</dd>
      </div>
      <div>
        <dt>FW</dt>
        <dd>{{ player.firmware }}</dd>
      </div>
    </dl>

    <footer class="channel-foot">
      <!-- Latching key: pressed in and lit while the player is announced to Plexamp -->
      <button
        type="button"
        role="switch"
        class="key"
        :class="{ engaged: !player.hidden, saving: player.saving }"
        :aria-checked="!player.hidden"
        :aria-label="`Show ${player.name} in Plexamp`"
        :disabled="player.saving"
        @click="emit('update:hidden', !player.hidden)"
      >
        <span class="key-lamp" aria-hidden="true" />
        <span class="key-label">{{ player.hidden ? 'Show in Plexamp' : 'In Plexamp' }}</span>
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useClipboard } from '@vueuse/core'
import type { DashboardPlayer } from '../composables/usePlayerDashboard'

const props = defineProps<{ player: DashboardPlayer }>()
const emit = defineEmits<{ 'update:hidden': [hidden: boolean] }>()

// The model image comes from LMS, show a speaker icon until it loaded or if it is missing
const imageLoaded = ref(false)
const imageFailed = ref(false)
const { copy } = useClipboard({ legacy: true })
const toast = useToast()

// Extension point: "Add to group…" will live here once player groups exist
const menuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: props.player.hidden ? 'Show in Plexamp' : 'Hide from Plexamp',
    icon: props.player.hidden ? 'i-lucide-radio' : 'i-lucide-eye-off',
    disabled: props.player.saving,
    onSelect: () => emit('update:hidden', !props.player.hidden)
  },
  {
    label: 'Copy player ID',
    icon: 'i-lucide-copy',
    onSelect: async () => {
      await copy(props.player.id)
      toast.add({ title: `Copied ID of ${props.player.name}`, icon: 'i-lucide-copy', color: 'neutral' })
    }
  }
])
</script>

<style scoped>
.channel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem 0.875rem;
  background: var(--rack-panel);
  border: 1px solid var(--rack-edge);
  border-radius: 0.5rem;
  box-shadow:
    inset 0 1px 0 var(--rack-edge-highlight),
    0 2px 6px rgba(0, 0, 0, 0.25);
  transition:
    opacity 300ms ease,
    filter 300ms ease;
}

.channel.is-standby {
  filter: saturate(0.2);
  opacity: 0.85;
}

.channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2rem;
}

.channel-model {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rack-engrave-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.channel-model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-state {
  flex: none;
  padding: 0.05rem 0.4rem;
  color: var(--rack-engrave);
  border: 1px solid var(--rack-edge);
  border-radius: 0.2rem;
}

/* Recessed screen with faint CRT scanlines */
.bezel {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 2 / 1;
  background: radial-gradient(ellipse at center, #1a2120 0%, var(--readout-bg) 75%);
  border: 1px solid var(--readout-edge);
  border-radius: 0.375rem;
  box-shadow:
    inset 0 2px 10px rgba(0, 0, 0, 0.85),
    0 1px 0 var(--rack-edge-highlight);
  overflow: hidden;
}

.bezel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px);
  pointer-events: none;
}

.bezel-image {
  /* LMS model images are square, fit them into the wide bezel without cropping */
  position: absolute;
  inset: 8%;
  width: 84%;
  height: 84%;
  object-fit: contain;
}

.bezel-icon {
  width: 2.25rem;
  height: 2.25rem;
  color: var(--readout-dim);
  opacity: 0.6;
}

.channel-name {
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--rack-engrave);
  /* Always reserve two lines, so readouts and controls line up across a row */
  min-height: calc(2 * 1.3em);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

/* Terminal readout, always dark glass with phosphor text */
.readout {
  display: grid;
  gap: 0.125rem;
  padding: 0.5rem 0.625rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--readout-text);
  background: var(--readout-bg);
  border-radius: 0.25rem;
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
  text-shadow: 0 0 6px rgba(130, 200, 190, 0.35);
}

.readout div {
  display: grid;
  grid-template-columns: 2rem 1fr;
}

.readout dt {
  color: var(--readout-dim);
}

.readout dd {
  overflow-wrap: anywhere;
}

.channel-foot {
  /* Pinned to the bottom, cards in a row stretch to the same height */
  margin-top: auto;
  padding-top: 0.25rem;
}

.key {
  --key-face: linear-gradient(180deg, #313a39 0%, #222928 100%);
  --key-text: var(--rack-engrave-muted);
  display: grid;
  /* Lamp and label on the left, like the legend on a hardware key */
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  min-height: 3rem;
  padding: 0 0.875rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  color: var(--key-text);
  background: var(--key-face);
  border: 1px solid #0a0d0d;
  border-radius: 0.3rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 3px 0 #070909,
    0 4px 6px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition:
    transform 90ms ease-out,
    box-shadow 90ms ease-out,
    background 200ms ease,
    color 200ms ease;
}

:root:not(.dark) .key {
  --key-face: linear-gradient(180deg, #fbfbfa 0%, #dfe2e2 100%);
  border-color: #8f9596;
  box-shadow:
    inset 0 1px 0 #fff,
    0 3px 0 #8f9596,
    0 4px 6px rgba(0, 0, 0, 0.18);
}

.key:hover:not(:disabled) {
  --key-text: var(--rack-engrave);
}

.key:active:not(:disabled) {
  transform: translateY(2px);
}

.key:focus-visible {
  outline: 2px solid var(--color-squeeze-400);
  outline-offset: 3px;
}

.key:disabled {
  cursor: progress;
}

/* Engaged: the key latches lower and is backlit amber */
.key.engaged,
:root:not(.dark) .key.engaged {
  --key-face: linear-gradient(180deg, #ffb547 0%, #ff9800 100%);
  --key-text: #2b1700;
  border-color: #8a4200;
  transform: translateY(2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 240, 210, 0.7),
    inset 0 -2px 6px rgba(160, 70, 0, 0.35),
    0 1px 0 #4a2300,
    0 0 18px rgba(255, 152, 0, 0.28);
}

.key-label {
  /* Trim the line box to the capitals, so the label centers like the lamp (no descender space below) */
  text-box: trim-both cap alphabetic;
}

.key-lamp {
  width: 0.5rem;
  height: 1.25rem;
  border-radius: 0.125rem;
  background: var(--led-off);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}

.key.engaged .key-lamp {
  background: #fff4dc;
  box-shadow:
    0 0 4px 1px rgba(255, 244, 220, 0.9),
    0 0 10px 2px rgba(255, 200, 120, 0.6);
}

.key.saving .key-lamp {
  animation: lamp-blink 0.6s steps(1) infinite;
}

@keyframes lamp-blink {
  50% {
    opacity: 0.2;
  }
}

@media (max-width: 640px) {
  .bezel {
    aspect-ratio: 21 / 8;
  }
}
</style>
