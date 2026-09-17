<script setup lang="ts">
import { computed } from 'vue'

import type { AgentEvent } from '../../types/agent'
import { extractToolText } from '../../utils/tool-result'

type ToolTimelineItem = Extract<AgentEvent, { type: 'tool' }>

const props = defineProps<{
	item: ToolTimelineItem
}>()

const stateLabel = computed(() => {
	if (props.item.status === 'running') return '调用中'
	if (props.item.status === 'error') return '执行失败'
	return '执行完成'
})

const input = computed(() =>
	JSON.stringify(props.item.args, null, 2)
)

const output = computed(() => {
	if (props.item.error) return props.item.error
	if (props.item.result) return extractToolText(props.item.result)
	return ''
})
</script>

<template>
	<details class="tool-card">
		<summary>
			<span><i /> <strong>{{ item.name }}</strong></span>
			<em :class="item.status">{{ stateLabel }}</em>
		</summary>
		<div class="tool-card-content">
			<pre>{{ input }}</pre>
			<pre v-if="output">{{ output }}</pre>
		</div>
	</details>
</template>

<style scoped>
.tool-card {
	max-width: 820px;
	margin: 12px auto;
	overflow: hidden;
	border: 1px solid #dce4df;
	border-radius: 10px;
	background: #f4f7f5;
}

.tool-card summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 13px;
	cursor: pointer;
	list-style: none;
}

.tool-card summary::-webkit-details-marker {
	display: none;
}

.tool-card summary span {
	display: flex;
	align-items: center;
	gap: 8px;
	color: #3e5047;
	font-size: 11px;
}

.tool-card summary i {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #638276;
}

.tool-card summary strong {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tool-card summary em {
	color: #7a8881;
	font-size: 10px;
	font-style: normal;
}

.tool-card summary em.complete {
	color: #168054;
}

.tool-card summary em.error {
	color: #b94242;
}

.tool-card-content {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1px;
	border-top: 1px solid #dce4df;
	background: #dce4df;
}

.tool-card-content pre {
	max-height: 250px;
	margin: 0;
	padding: 13px;
	overflow: auto;
	color: #44534c;
	background: #fbfcfb;
	font: 10px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
	white-space: pre-wrap;
}
</style>
