<script setup lang="ts">
import { useTemplateRef } from 'vue'

const draft = defineModel<string>({ required: true })

defineProps<{
	disabled?: boolean
}>()

const emit = defineEmits<{
	submit: []
}>()

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')

function resize() {
	if (!textarea.value) return
	textarea.value.style.height = 'auto'
	textarea.value.style.height = `${Math.min(
		textarea.value.scrollHeight,
		140
	)}px`
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault()
		emit('submit')
	}
}

function focus() {
	textarea.value?.focus()
}

defineExpose({ focus })
</script>

<template>
	<footer class="composer-shell">
		<form
			class="composer"
			@submit.prevent="emit('submit')"
		>
			<textarea
				ref="textarea"
				v-model="draft"
				rows="1"
				placeholder="输入你的售后问题……"
				aria-label="售后问题"
				:disabled="disabled"
				@input="resize"
				@keydown="handleKeydown"
			/>
			<button
				type="submit"
				:disabled="disabled || !draft.trim()"
			>
				<span>发送</span>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4 12 20 4l-5 16-3-7-8-1Zm8 1 3-5-7 4 4 1Z"
					/>
				</svg>
			</button>
		</form>
		<p>重要写操作会在执行前请求人工确认</p>
	</footer>
</template>

<style scoped>
.composer-shell {
	padding: 14px 7.5% 17px;
	border-top: 1px solid #e2e8e3;
	background: rgba(255, 255, 255, 0.92);
}

.composer {
	display: flex;
	max-width: 880px;
	margin: 0 auto;
	padding: 7px 7px 7px 15px;
	gap: 10px;
	border: 1px solid #d5ded8;
	border-radius: 13px;
	background: #fff;
	box-shadow: 0 7px 20px rgba(31, 50, 40, 0.06);
}

.composer:focus-within {
	border-color: #6e897d;
	box-shadow: 0 0 0 3px rgba(36, 83, 65, 0.08);
}

.composer textarea {
	width: 100%;
	max-height: 140px;
	padding: 8px 0;
	resize: none;
	border: 0;
	outline: 0;
	color: #26362e;
	background: transparent;
	font-size: 13px;
	line-height: 1.5;
}

.composer button {
	display: flex;
	align-items: center;
	align-self: flex-end;
	padding: 9px 13px;
	gap: 5px;
	border: 0;
	border-radius: 9px;
	color: #fff;
	background: #1b4939;
	font-size: 12px;
	font-weight: 700;
}

.composer button svg {
	width: 15px;
	height: 15px;
	fill: currentColor;
}

.composer-shell > p {
	margin: 7px auto 0;
	color: #99a29d;
	font-size: 9px;
	text-align: center;
}
</style>
