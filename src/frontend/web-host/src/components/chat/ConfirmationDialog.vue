<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
	visible: boolean
	message: string
}>()

const emit = defineEmits<{
	accept: []
	decline: []
}>()

const acceptButton =
	useTemplateRef<HTMLButtonElement>('acceptButton')

watch(
	() => props.visible,
	(visible) => {
		if (visible) {
			queueMicrotask(() => acceptButton.value?.focus())
		}
	}
)
</script>

<template>
	<div v-if="visible" class="modal">
		<div class="modal-backdrop" />
		<section
			class="modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<div class="modal-icon">!</div>
			<p class="eyebrow">HUMAN IN THE LOOP</p>
			<h2 id="confirm-title">需要你确认这次操作</h2>
			<p>{{ message }}</p>
			<div class="modal-actions">
				<button
					class="ghost-button"
					@click="emit('decline')"
				>
					取消操作
				</button>
				<button
					ref="acceptButton"
					class="primary-button"
					@click="emit('accept')"
				>
					确认执行
				</button>
			</div>
		</section>
	</div>
</template>

<style scoped>
.modal {
	position: fixed;
	z-index: 20;
	inset: 0;
	display: grid;
	place-items: center;
}

.modal-backdrop {
	position: absolute;
	inset: 0;
	background: rgba(12, 28, 21, 0.52);
	backdrop-filter: blur(5px);
}

.modal-card {
	position: relative;
	width: min(440px, calc(100vw - 40px));
	padding: 28px;
	border-radius: 16px;
	background: #fff;
	box-shadow: 0 30px 80px rgba(8, 24, 17, 0.28);
}

.modal-icon {
	display: grid;
	width: 38px;
	height: 38px;
	margin-bottom: 18px;
	place-items: center;
	border-radius: 10px;
	color: #6b4b00;
	background: #ffdf89;
	font-weight: 900;
}

.eyebrow {
	margin: 0 0 10px;
	color: #658075;
	font-size: 10px;
	font-weight: 800;
	letter-spacing: 0.14em;
}

.modal-card h2 {
	margin: 0 0 10px;
	font-size: 20px;
}

.modal-card > p:not(.eyebrow) {
	margin: 0;
	color: #66736c;
	font-size: 13px;
	line-height: 1.7;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: 24px;
	gap: 9px;
}

.ghost-button,
.primary-button {
	padding: 9px 14px;
	border-radius: 8px;
	font-size: 12px;
	font-weight: 700;
}

.ghost-button {
	border: 1px solid #d9e0db;
	color: #42534b;
	background: #fff;
}

.primary-button {
	border: 1px solid #163e31;
	color: #fff;
	background: #163e31;
}
</style>
