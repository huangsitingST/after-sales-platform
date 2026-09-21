<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'

import type { AgentEvent } from '../../types/agent'
import ChatMessage from './ChatMessage.vue'
import ToolCallCard from './ToolCallCard.vue'

const props = defineProps<{
	items: AgentEvent[]
}>()

const timeline = useTemplateRef<HTMLElement>('timeline')

watch(
	() => props.items.length,
	async () => {
		await nextTick()
		timeline.value?.scrollTo({
			top: timeline.value.scrollHeight,
			behavior: 'smooth'
		})
	}
)
</script>

<template>
	<section
		ref="timeline"
		class="timeline"
		aria-live="polite"
	>
		<div v-if="!items.length" class="welcome-card">
			<div class="welcome-icon">AI</div>
			<div>
				<h2>你好，我是企业售后 Agent</h2>
				<p>
					可以查订单、查物流、预审退款，财务身份还可以查看批量审核报告。
				</p>
			</div>
		</div>

		<template
			v-for="item in items"
			:key="item.id"
		>
			<ChatMessage
				v-if="item.type === 'message'"
				:role="item.role"
				:text="item.text"
			/>
			<div
				v-else-if="item.type === 'status'"
				class="status-line"
				:class="{ done: item.done }"
			>
				<span /> {{ item.text }}
			</div>
			<ToolCallCard
				v-else-if="item.type === 'tool'"
				:item="item"
			/>
		</template>
	</section>
</template>

<style scoped>
.timeline {
	min-height: 0;
	padding: 26px 7.5% 42px;
	overflow-y: auto;
	scroll-behavior: smooth;
}

.welcome-card {
	display: flex;
	max-width: 760px;
	margin: 2vh auto 32px;
	padding: 24px;
	gap: 15px;
	border: 1px solid #dfe6e1;
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 12px 28px rgba(34, 55, 44, 0.05);
}

.welcome-icon {
	display: grid;
	width: 42px;
	height: 42px;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 11px;
	color: #153b2f;
	background: #d5f43b;
	font-size: 12px;
	font-weight: 900;
}

.welcome-card h2 {
	margin: 1px 0 7px;
	font-size: 16px;
}

.welcome-card p {
	margin: 0;
	color: #697770;
	font-size: 13px;
	line-height: 1.8;
}

.status-line {
	display: flex;
	align-items: center;
	width: max-content;
	max-width: 880px;
	margin: 16px auto;
	color: #7a8780;
	font-size: 11px;
}

.status-line span {
	width: 7px;
	height: 7px;
	margin-right: 8px;
	border: 2px solid #a9b7af;
	border-top-color: #2d5c49;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

.status-line.done span {
	border-color: #77a38f;
	background: #77a38f;
	animation: none;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
