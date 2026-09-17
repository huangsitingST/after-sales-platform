<script setup lang="ts">
import { computed } from 'vue'

import type { ReviewResult } from '../types'

const props = defineProps<{
	result: ReviewResult
}>()

const values = computed(() => [
	{ label: '订单总数3', value: props.result.total },
	{ label: '自动通过2', value: props.result.autoApproved },
	{ label: '人工审核2', value: props.result.manualReview },
	{ label: '拒绝退款', value: props.result.rejected }
])
</script>

<template>
	<section class="summary" aria-label="审核统计">
		<div v-for="item in values" :key="item.label">
			<span>{{ item.label }}</span>
			<strong>{{ item.value }}</strong>
		</div>
	</section>1
</template>

<style scoped>
.summary {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 1px;
	margin: 22px 0;
	border: 1px solid #d9e0e7;
	background: #d9e0e7;
}

.summary div {
	padding: 18px;
	background: #fff;
}

.summary span {
	display: block;
	color: #657282;
	font-size: 13px;
}

.summary strong {
	display: block;
	margin-top: 7px;
	font-size: 26px;
}

@media (max-width: 680px) {
	.summary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
