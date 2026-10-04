<template>
  <UModal
    v-model:open="open"
    title="Pair as stereo"
    description="Both players are synced, one plays the left and the other the right channel."
    @after:leave="emit('close')"
  >
    <template #body>
      <form id="pair-form" class="pair-form" @submit.prevent="submit">
        <UFormField label="Partner">
          <USelect v-model="partnerId" :items="partnerItems" placeholder="Choose a player" class="w-full" />
        </UFormField>
        <UFormField :label="`${player.name} plays`">
          <URadioGroup v-model="side" :items="sideItems" orientation="horizontal" />
        </UFormField>
        <UFormField label="Name in Plexamp">
          <UInput :model-value="name" class="w-full" @update:model-value="onNameInput" />
        </UFormField>
        <p v-if="candidates.length === 0" class="pair-hint">There is no other free player on this Lyrion server.</p>
      </form>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
      <UButton type="submit" form="pair-form" :disabled="!partner || !name.trim()" :loading="saving">Create pair</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DashboardPlayer } from '../composables/usePlayerDashboard'

const props = defineProps<{
  player: DashboardPlayer
  // Free players of the same server
  candidates: DashboardPlayer[]
  create: (name: string, left: DashboardPlayer, right: DashboardPlayer) => Promise<boolean>
}>()
const emit = defineEmits<{ close: [] }>()

const open = ref(true)
const saving = ref(false)
const partnerId = ref<string | undefined>(props.candidates[0]?.id)
const side = ref<'left' | 'right'>('left')
const sideItems = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' }
]

const partner = computed(() => props.candidates.find((candidate) => candidate.id === partnerId.value))
const partnerItems = computed(() =>
  props.candidates.map((candidate) => ({ label: `${candidate.name} (${candidate.modelName})`, value: candidate.id }))
)

// Suggest a name until the user types their own
const name = ref('')
const nameEdited = ref(false)
watch(
  [partner, side],
  () => {
    if (!nameEdited.value) {
      const [left, right] = side.value === 'left' ? [props.player, partner.value] : [partner.value, props.player]
      name.value = left && right ? `${left.name} ⇄ ${right.name}` : ''
    }
  },
  { immediate: true }
)
function onNameInput(value: string | number | undefined) {
  name.value = String(value ?? '')
  nameEdited.value = true
}

async function submit() {
  if (!partner.value) return
  saving.value = true
  const [left, right] = side.value === 'left' ? [props.player, partner.value] : [partner.value, props.player]
  const created = await props.create(name.value.trim(), left, right)
  saving.value = false
  if (created) open.value = false
}
</script>

<style scoped>
.pair-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pair-hint {
  font-size: 0.9rem;
  opacity: 0.8;
}
</style>
