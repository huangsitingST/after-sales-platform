export class ElicitationRequiredError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ElicitationRequiredError'
	}
}
