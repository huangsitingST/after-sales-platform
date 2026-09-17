<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
	role: 'user' | 'assistant'
	text: string
}>()

const avatar = computed(() =>
	props.role === 'user' ? '我' : 'AI'
)

const meta = computed(() =>
	props.role === 'user' ? '用户' : '售后 Agent'
)
</script>

<template>
	<article class="message" :class="role">
		<div class="avatar">{{ avatar }}</div>
		<div class="message-body">
			<p class="message-meta">{{ meta }}</p>
			<div class="message-content">{{ text }}</div>
		</div>
	</article>
</template>

<style scoped>
.message {
	display: flex;
	max-width: 880px;
	margin: 22px auto;
	gap: 12px;
}

.message.user {
	flex-direction: row-reverse;
}

.avatar {
	display: grid;
	width: 34px;
	height: 34px;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 9px;
	color: #fff;
	background: #163e31;
	font-size: 10px;
	font-weight: 800;
}

.message.user .avatar {
	color: #274431;
	background: #d8e0da;
}

.message-body {
	min-width: 0;
	max-width: 76%;
}

.message-meta {
	margin: 0 0 6px;
	color: #89948e;
	font-size: 10px;
}

.message.user .message-meta {
	text-align: right;
}

.message-content {
	padding: 13px 16px;
	border: 1px solid #e1e7e3;
	border-radius: 5px 15px 15px 15px;
	color: #2f3c35;
	background: #fff;
	font-size: 13px;
	line-height: 1.75;
	white-space: pre-wrap;
}

.message.user .message-content {
	border: 0;
	border-radius: 15px 5px 15px 15px;
	color: #f5faf7;
	background: #245341;
}
</style>
