<script setup lang="ts">
import { computed } from 'vue'

import OrderResultTable from './components/OrderResultTable.vue'
import SummaryGrid from './components/SummaryGrid.vue'
import { useMcpApp } from './composables/useMcpApp'

const { report } = useMcpApp()
const job = computed(() => report.value?.job)
const result = computed(() => job.value?.result)
</script>

<template>
	<main class="report-shell">
		<header class="report-header">
			<div>
				<p class="eyebrow">AFTER-SALES CONTROL</p>
				<h1>批量退款审核报告</h1>
			</div>
			<span
				class="status"
				:class="{ completed: result }"
			>
				{{ result ? '审核完成' : '等待数据' }}
			</span>
		</header>

		<SummaryGrid v-if="result" :result="result" />

		<section class="table-section">
			<div class="section-heading">
				<h2>订单明细</h2>
				<span>{{ job?.jobId ?? '尚未收到任务' }}</span>
			</div>
			<OrderResultTable
				v-if="result"
				:details="result.details"
			/>
			<div v-else class="empty">
				Host 调用报告 Tool 后，结果会显示在这里。
			</div>
		</section>
	</main>
</template>

<style scoped>
.report-shell {
	width: min(100%, 1080px);
	margin: 0 auto;
	padding: 28px;
}

.report-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 20px;
	padding-bottom: 22px;
	border-bottom: 1px solid #d9e0e7;
}

.eyebrow {
	margin: 0 0 8px;
	color: #637080;
	font-size: 12px;
	font-weight: 700;
}

.report-header h1 {
	margin: 0;
	font-size: 28px;
	line-height: 1.25;
}

.status {
	display: inline-flex;
	align-items: center;
	padding: 7px 10px;
	border-radius: 4px;
	color: #5d6876;
	background: #e8edf1;
	font-size: 12px;
	font-weight: 700;
	white-space: nowrap;
}

.status.completed {
	color: #0a6b44;
	background: #dff4e9;
}

.table-section {
	border: 1px solid #d9e0e7;
	background: #fff;
}

.section-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 16px 18px;
	border-bottom: 1px solid #e4e9ee;
}

.section-heading h2 {
	margin: 0;
	font-size: 17px;
}

.section-heading span {
	color: #728090;
	font-family: monospace;
	font-size: 12px;
}

.empty {
	display: grid;
	height: 120px;
	place-items: center;
	color: #7a8795;
	font-size: 13px;
}

@media (max-width: 680px) {
	.report-shell {
		padding: 18px 14px;
	}

	.report-header {
		align-items: stretch;
		flex-direction: column;
	}

	.status {
		align-self: flex-start;
	}

	.section-heading {
		align-items: flex-start;
		flex-direction: column;
	}
}
</style>
