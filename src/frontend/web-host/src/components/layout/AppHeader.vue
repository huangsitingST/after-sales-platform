<script setup lang="ts">
defineProps<{
	disabled?: boolean
}>()

const emit = defineEmits<{
	reset: []
}>()
</script>

<template>
	<header class="topbar">
		<div>
			<p class="eyebrow">ENTERPRISE AGENT WORKSPACE</p>
			<h1>企业售后 Agent</h1>
		</div>
		<button
			class="ghost-button"
			:disabled="disabled"
			@click="emit('reset')"
		>
			新建对话
		</button>
	</header>
</template>

<style scoped>
.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 22px 32px 18px;
	border-bottom: 1px solid #e4e9e5;
	background: rgba(255, 255, 255, 0.82);
}

.eyebrow {
	margin: 0 0 5px;
	color: #658075;
	font-size: 10px;
	font-weight: 800;
	letter-spacing: 0.14em;
}

.topbar h1 {
	margin: 0;
	font-size: 21px;
}

.ghost-button {
	padding: 9px 14px;
	border: 1px solid #d9e0db;
	border-radius: 8px;
	color: #42534b;
	background: #fff;
	font-size: 12px;
	font-weight: 700;
}
</style>
