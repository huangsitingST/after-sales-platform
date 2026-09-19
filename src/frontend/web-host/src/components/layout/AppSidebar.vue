<script setup lang="ts">
import type {
	ConnectionState,
	IdentityToken
} from '../../types/agent'

const identity = defineModel<IdentityToken>('identity', {
	required: true
})

defineProps<{
	connection: ConnectionState
	capabilityCount: number
	modelName: string
	disabled?: boolean
}>()

const emit = defineEmits<{
	prompt: [text: string]
	appDemo: []
}>()

const identities: Array<{ value: IdentityToken; label: string }> = [
	{
		value: 'token-blue-service',
		label: '蓝鲸科技 · 客服小周'
	},
	{
		value: 'token-blue-finance',
		label: '蓝鲸科技 · 财务小林'
	},
	// {
	// 	value: 'token-star-service',
	// 	label: '星河零售 · 客服小李'
	// }
]
</script>

<template>
	<aside class="sidebar">
		<div class="brand">
			<div class="brand-mark">A</div>
			<div>
				<strong>AFTERCARE AI</strong>
				<span>Enterprise Agent</span>
			</div>
		</div>

		<section class="side-section identity-panel">
			<label for="identity">当前演示身份</label>
			<select id="identity" v-model="identity" :disabled="disabled">
				<option v-for="item in identities" :key="item.value" :value="item.value">
					{{ item.label }}
				</option>
			</select>
			<div class="connection-row">
				<span class="connection-dot" :class="connection.status" />
				<span>{{ connection.text }}</span>
			</div>
		</section>

		<section class="side-section">
			<p class="side-label">快速演示</p>
			<button class="prompt-button" :disabled="disabled" @click="emit('prompt', '订单 A1024 可以退款吗？')">
				<span>01</span>退款资格预审
			</button>
			<button class="prompt-button" :disabled="disabled" @click="emit('prompt', '它现在的物流到哪里了？')">
				<span>02</span>连续对话与物流
			</button>
			<button class="prompt-button app-demo-button" :disabled="disabled" @click="emit('appDemo')">
				<span>03</span>批量审核报告演示
			</button>
		</section>

		<section class="side-section capability-panel">
			<p class="side-label">当前能力</p>
			<div><span>能力数量</span><strong>{{ capabilityCount }}</strong></div>
			<div><span>Model</span><strong>{{ modelName }}</strong></div>
			<div><span>执行位置</span><strong>服务端</strong></div>
		</section>
	</aside>
</template>

<style scoped>
.sidebar {
	display: flex;
	min-height: 0;
	padding: 24px 20px;
	flex-direction: column;
	color: #eef5f0;
	background: #163e31;
}

.brand {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 28px;
}

.brand-mark {
	display: grid;
	width: 40px;
	height: 40px;
	place-items: center;
	border-radius: 12px;
	color: #173d31;
	background: #d5f43b;
	font-size: 19px;
	font-weight: 900;
}

.brand strong,
.brand span {
	display: block;
}

.brand strong {
	font-size: 13px;
	letter-spacing: 0.1em;
}

.brand span {
	margin-top: 3px;
	color: #9fb5aa;
	font-size: 11px;
}

.side-section {
	padding: 20px 0;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.identity-panel label,
.side-label {
	display: block;
	margin: 0 0 10px;
	color: #9fb5aa;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.identity-panel select {
	width: 100%;
	padding: 10px 11px;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 8px;
	outline: 0;
	color: #f6faf7;
	background: #214c3f;
	font-size: 12px;
}

.connection-row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 12px;
	color: #bad0c5;
	font-size: 11px;
}

.connection-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #d9a731;
}

.connection-dot.connected {
	background: #6ee7a2;
	box-shadow: 0 0 0 4px rgba(110, 231, 162, 0.1);
}

.connection-dot.error {
	background: #ff8d7d;
}

.prompt-button {
	display: flex;
	align-items: center;
	width: 100%;
	margin-top: 7px;
	padding: 10px 9px;
	border: 0;
	border-radius: 8px;
	color: #d8e3dd;
	background: transparent;
	font-size: 12px;
	text-align: left;
}

.prompt-button:hover {
	color: #fff;
	background: rgba(255, 255, 255, 0.08);
}

.prompt-button span {
	width: 30px;
	color: #7f9a8c;
	font: 10px ui-monospace, monospace;
}

.app-demo-button {
	color: #173d31;
	background: #d5f43b;
	font-weight: 800;
}

.app-demo-button:hover {
	color: #173d31;
	background: #e1fa64;
}

.app-demo-button span {
	color: #57701b;
}

.capability-panel {
	margin-top: auto;
}

.capability-panel div {
	display: flex;
	justify-content: space-between;
	gap: 10px;
	padding: 5px 0;
	color: #9fb5aa;
	font-size: 11px;
}

.capability-panel strong {
	overflow: hidden;
	color: #e9f1ed;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
