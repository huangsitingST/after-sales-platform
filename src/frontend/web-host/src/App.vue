<script setup lang="ts">
import {
	nextTick,
	onMounted,
	shallowRef,
	useTemplateRef,
	watch
} from 'vue'

import AppHeader from './components/layout/AppHeader.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import ChatTimeline from './components/chat/ChatTimeline.vue'
import ConfirmationDialog from './components/chat/ConfirmationDialog.vue'
import MessageComposer from './components/chat/MessageComposer.vue'
import { useAfterSalesAgent } from './composables/useAfterSalesAgent'

const {
	identity,
	timeline,
	connection,
	confirmation,
	modelName,
	capabilityCount,
	interactionDisabled,
	initialize,
	selectIdentity,
	startNewConversation,
	submitQuestion,
	answerConfirmation
} = useAfterSalesAgent()

const draft = shallowRef('')
const composer = useTemplateRef<InstanceType<typeof MessageComposer>>(
	'composer'
)

function setPrompt(text: string) {
	draft.value = text
	composer.value?.focus()
}

function submit() {
	const question = draft.value.trim()
	if (!question || interactionDisabled.value) return
	draft.value = ''
	void submitQuestion(question)
}

watch(
	() => interactionDisabled.value,
	async (disabled) => {
		if (disabled) return
		await nextTick()
		composer.value?.focus()
	}
)

onMounted(() => {
	void initialize()
})
</script>

<template>
	<div class="shell">
		<AppSidebar :identity="identity" :connection="connection" :capability-count="capabilityCount"
			:model-name="modelName" :disabled="interactionDisabled" @update:identity="selectIdentity" @prompt="setPrompt" />

		<main class="workspace">
			<AppHeader :disabled="interactionDisabled" @reset="startNewConversation()" />
			<ChatTimeline :items="timeline" />
			<MessageComposer ref="composer" v-model="draft" :disabled="interactionDisabled" @submit="submit" />
		</main>
	</div>

	<ConfirmationDialog :visible="confirmation.visible" :message="confirmation.message" @accept="answerConfirmation(true)"
		@decline="answerConfirmation(false)" />
</template>
