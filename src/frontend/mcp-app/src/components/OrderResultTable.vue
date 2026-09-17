<script setup lang="ts">
import type { ReviewDetail } from '../types'

defineProps<{
	details: ReviewDetail[]
}>()

function resultLabel(item: ReviewDetail) {
	if (!item.eligible) {
		return { label: '拒绝', tone: 'danger' }
	}
	if (item.manualReview) {
		return { label: '待人工审核', tone: 'warning' }
	}
	return { label: '自动通过', tone: 'success' }
}

function actionLabel(item: ReviewDetail) {
	if (item.manualReview) return '转人工'
	if (item.eligible) return '系统处理'
	return '终止退款'
}
</script>

<template>
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>订单号</th>
					<th>审核结果</th>
					<th>处理方式</th>
					<th>判断依据</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="item in details" :key="item.orderId">
					<td><strong>{{ item.orderId }}</strong></td>
					<td>
						<span
							class="result"
							:class="resultLabel(item).tone"
						>
							{{ resultLabel(item).label }}
						</span>
					</td>
					<td>{{ actionLabel(item) }}</td>
					<td>{{ item.conclusion }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<style scoped>
.table-wrap {
	overflow-x: auto;
}

table {
	width: 100%;
	border-collapse: collapse;
}

th,
td {
	padding: 14px 16px;
	border-bottom: 1px solid #edf0f3;
	text-align: left;
	font-size: 13px;
}

th {
	color: #687687;
	background: #fafbfc;
	font-weight: 600;
}

tbody tr:last-child td {
	border-bottom: 0;
}

.result {
	display: inline-flex;
	align-items: center;
	padding: 4px 7px;
	border-radius: 4px;
	font-size: 12px;
	font-weight: 700;
	white-space: nowrap;
}

.result.success {
	color: #086a43;
	background: #dff4e9;
}

.result.warning {
	color: #945b00;
	background: #fff0cc;
}

.result.danger {
	color: #a02929;
	background: #fde5e5;
}
</style>
