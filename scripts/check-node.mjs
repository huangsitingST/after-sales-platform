const [major, minor] = process.versions.node
	.split('.')
	.map((value) => Number(value))

const supported = major > 20 || (major === 20 && minor >= 19)

if (!supported) {
	console.error(
		[
			`当前 Node.js 版本是 v${process.versions.node}，项目要求 v20.19 或更高。`,
			'如果使用 nvm，请先执行：',
			'  nvm use 20.19.6',
			'然后重新运行当前命令。'
		].join('\n')
	)
	process.exit(1)
}
