<template>
  <section class="rack-unit" :aria-labelledby="headingId">
    <span class="screw tl" aria-hidden="true" />
    <span class="screw tr" aria-hidden="true" />
    <span class="screw bl" aria-hidden="true" />
    <span class="screw br" aria-hidden="true" />

    <header class="unit-head">
      <h2 :id="headingId" class="unit-label">
        <span class="power-led" aria-hidden="true" />
        <span class="unit-kind">LMS</span>
        {{ section.server.name }}
      </h2>
      <p class="unit-readout">
        <span>{{ section.server.ip }}:{{ section.server.jsonPort }}</span>
        <span v-if="section.server.ver">v{{ section.server.ver }}</span>
        <span>{{ playerCount }} {{ playerCount === 1 ? 'player' : 'players' }}</span>
      </p>
    </header>

    <div v-if="section.items.length > 0" class="channel-grid">
      <template v-for="item in section.items" :key="item.id">
        <PlayerCard
          :player="item.player"
          :pair="item.kind === 'pair' ? item.pair : undefined"
          @update:hidden="(hidden) => emit('update:hidden', item.player, hidden)"
          @pair="emit('pair', item.player)"
          @dissolve="emit('dissolve', item.player)"
        />
      </template>
    </div>
    <p v-else class="unit-empty">All players of this server are hidden from Plexamp.</p>

    <UCollapsible v-if="section.hiddenItems.length > 0" v-model:open="standbyOpen" class="standby">
      <UButton color="neutral" variant="ghost" block class="standby-toggle" :ui="{ base: 'justify-between' }">
        <span class="standby-kind">Hidden players ({{ section.hiddenItems.length }})</span>
        <template #trailing>
          <span class="standby-action">
            {{ standbyOpen ? 'Hide' : 'Show' }}
            <UIcon :name="standbyOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-5" aria-hidden="true" />
          </span>
        </template>
      </UButton>
      <template #content>
        <div class="channel-grid standby-grid">
          <template v-for="item in section.hiddenItems" :key="item.id">
            <PlayerCard
              :player="item.player"
              :pair="item.kind === 'pair' ? item.pair : undefined"
              @update:hidden="(hidden) => emit('update:hidden', item.player, hidden)"
              @pair="emit('pair', item.player)"
              @dissolve="emit('dissolve', item.player)"
            />
          </template>
        </div>
      </template>
    </UCollapsible>
  </section>
</template>

<script setup lang="ts">
import type { DashboardPlayer, ServerSection } from '../composables/usePlayerDashboard'

const props = defineProps<{ section: ServerSection }>()
const emit = defineEmits<{
  'update:hidden': [player: DashboardPlayer, hidden: boolean]
  pair: [player: DashboardPlayer]
  dissolve: [player: DashboardPlayer]
}>()

const headingId = computed(() => `lms-${props.section.server.uuid}`)
const playerCount = computed(() => props.section.items.length + props.section.hiddenItems.length)
const standbyOpen = ref(false)
</script>

<style scoped>
/* A 19" rack unit: faceplate, corner screws, engraved label */
.rack-unit {
  /* The screws keep the same distance to the plate edge and to the content */
  --screw-inset: 0.5rem;
  --screw-size: 0.625rem;
  position: relative;
  padding: calc(2 * var(--screw-inset) + var(--screw-size));
  background: var(--rack-faceplate-sheen), var(--rack-faceplate);
  border: 1px solid var(--rack-edge);
  border-radius: 0.5rem;
  box-shadow:
    inset 0 1px 0 var(--rack-edge-highlight),
    0 6px 18px rgba(0, 0, 0, 0.35);
}

.screw {
  position: absolute;
  width: var(--screw-size);
  height: var(--screw-size);
  border-radius: 9999px;
  background: var(--rack-screw);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.screw::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 15%;
  right: 15%;
  height: 1px;
  background: rgba(0, 0, 0, 0.55);
  transform: rotate(-35deg);
}

.tl {
  top: var(--screw-inset);
  left: var(--screw-inset);
}
.tr {
  top: var(--screw-inset);
  right: var(--screw-inset);
}
.bl {
  bottom: var(--screw-inset);
  left: var(--screw-inset);
}
.br {
  bottom: var(--screw-inset);
  right: var(--screw-inset);
}

.unit-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-bottom: 1.25rem;
}

.unit-label {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--rack-engrave);
}

.unit-kind {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  color: var(--rack-engrave-muted);
}

.power-led {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--led-power);
  box-shadow: 0 0 6px 1px rgba(95, 220, 143, 0.6);
}

.unit-readout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  padding: 0.3rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  /* Teal for information, amber is reserved for "in Plexamp" */
  color: var(--readout-text);
  background: var(--readout-bg);
  border-radius: 0.25rem;
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
  text-shadow: 0 0 6px rgba(130, 200, 190, 0.35);
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  gap: 1rem;
  /* Recessed bay: the players are modules mounted in this server's plate */
  padding: 0.75rem;
  background: var(--rack-bay);
  border-radius: 0.375rem;
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px rgba(0, 0, 0, 0.25),
    0 1px 0 var(--rack-edge-highlight);
}

.unit-empty {
  padding: 1rem 0;
  font-size: 0.9rem;
  color: var(--rack-engrave-muted);
}

.standby {
  margin-top: 1.25rem;
  border-top: 1px dashed var(--rack-edge);
  padding-top: 0.5rem;
}

.standby-toggle {
  min-height: 2.75rem;
}

.standby-action {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.9rem;
  color: var(--rack-engrave-muted);
}

.standby-kind {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.standby-grid {
  margin-top: 0.75rem;
}

@media (max-width: 640px) {
  .rack-unit {
    --screw-inset: 0.375rem;
    --screw-size: 0.5rem;
  }

  .channel-grid {
    grid-template-columns: 1fr;
    padding: 0.5rem;
  }
}
</style>
