<script setup lang="ts">
import {
	onBeforeUnmount,
	onMounted,
	shallowRef,
	toRaw,
	useTemplateRef
} from 'vue'
import {
	AppBridge,
	PostMessageTransport,
	buildAllowAttribute
} from '@modelcontextprotocol/ext-apps/app-bridge'

import type { AgentAppPayload } from '../../types/agent'

const props = defineProps<{
	app: AgentAppPayload
	sandboxUrl: string
}>()

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const ready = shallowRef(false)
const error = shallowRef('')
const frameHeight = shallowRef(520)
const resourceUri = props.app.resourceUri

let bridge: AppBridge | undefined

function waitForSandbox(iframe: HTMLIFrameElement, url: string) {
	return new Promise<void>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			window.removeEventListener('message', listener)
			reject(new Error('MCP App Sandbox 启动超时'))
		}, 5000)

		const listener = (event: MessageEvent) => {
			if (
				event.source === iframe.contentWindow &&
				event.data?.method ===
					'ui/notifications/sandbox-proxy-ready'
			) {
				window.clearTimeout(timeout)
				window.removeEventListener('message', listener)
				resolve()
			}
		}

		window.addEventListener('message', listener)
		iframe.src = url
	})
}

async function loadApp() {
	if (!frame.value) return

	try {
		const { html, csp, permissions } = props.app
		const iframe = frame.value
		const allow = buildAllowAttribute(
			permissions as Record<string, unknown>
		)

		iframe.setAttribute(
			'sandbox',
			'allow-scripts allow-same-origin allow-forms'
		)
		if (allow) iframe.setAttribute('allow', allow)

		const sandboxUrl = new URL(props.sandboxUrl)
		if (csp) {
			sandboxUrl.searchParams.set('csp', JSON.stringify(csp))
		}
		await waitForSandbox(iframe, sandboxUrl.href)

		bridge = new AppBridge(
			null,
			{
				name: 'enterprise-after-sales-web-host',
				version: '1.0.0'
			},
			{
				openLinks: {},
				serverTools: {},
				serverResources: {}
			},
			{
				hostContext: {
					theme: 'light',
					platform: 'web',
					locale: 'zh-CN',
					timeZone: 'Asia/Shanghai',
					displayMode: 'inline',
					availableDisplayModes: ['inline'],
					containerDimensions: {
						maxHeight: 900
					}
				}
			}
		)

		bridge.onopenlink = async ({ url }) => {
			window.open(url, '_blank', 'noopener,noreferrer')
			return {}
		}
		bridge.onmessage = async () => ({})
		bridge.onupdatemodelcontext = async () => ({})
		bridge.onsizechange = ({ height }) => {
			if (height) {
				frameHeight.value = Math.min(Math.max(height, 280), 900)
			}
		}
		bridge.onrequestdisplaymode = async () => ({ mode: 'inline' })

		const initialized = new Promise<void>((resolve) => {
			bridge!.oninitialized = () => resolve()
		})

		await bridge.connect(
			new PostMessageTransport(
				iframe.contentWindow!,
				iframe.contentWindow!
			)
		)
		await bridge.sendSandboxResourceReady({
			html,
			csp,
			permissions
		})
		await initialized
			await bridge.sendToolInput({
				arguments: toRaw(props.app.args)
			})
			await bridge.sendToolResult(
				toRaw(props.app.result) as never
			)
		ready.value = true
	} catch (loadError) {
		error.value =
			loadError instanceof Error
				? loadError.message
				: String(loadError)
	}
}

onMounted(loadApp)

onBeforeUnmount(() => {
	void bridge?.teardownResource({})
})
</script>

<template>
	<section class="mcp-app-shell">
		<header>
			<div><span /> MCP APP</div>
			<strong>{{ resourceUri }}</strong>
		</header>
		<div v-if="error" class="app-loading error">{{ error }}</div>
		<iframe
			v-else
			ref="frame"
			title="批量退款审核报告"
			class="mcp-app-frame"
			:style="{ height: `${frameHeight}px` }"
		/>
		<div v-if="!ready && !error" class="app-loading">
			正在从 MCP Server 加载 UI Resource……
		</div>
	</section>
</template>

<style scoped>
.mcp-app-shell {
	position: relative;
	max-width: 920px;
	margin: 20px auto 30px;
	overflow: hidden;
	border: 1px solid #cbd8d0;
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 16px 38px rgba(28, 52, 39, 0.1);
}

.mcp-app-shell > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	color: #6a7b72;
	background: #edf2ee;
	font-size: 9px;
	letter-spacing: 0.1em;
}

.mcp-app-shell > header div {
	display: flex;
	align-items: center;
	gap: 7px;
	font-weight: 900;
}

.mcp-app-shell > header span {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #77a116;
}

.mcp-app-shell > header strong {
	font: 9px ui-monospace, monospace;
	letter-spacing: 0;
}

.mcp-app-frame {
	display: block;
	width: 100%;
	border: 0;
	background: #f5f7f9;
	transition: height 0.25s ease;
}

.app-loading {
	position: absolute;
	inset: 31px 0 0;
	display: grid;
	place-items: center;
	color: #7b8881;
	background: #f5f7f9;
	font-size: 12px;
}

.app-loading.error {
	position: static;
	height: 260px;
	color: #b94242;
}
</style>
