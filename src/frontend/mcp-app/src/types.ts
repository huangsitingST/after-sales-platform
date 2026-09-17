export interface ReviewDetail {
	orderId: string
	eligible: boolean
	manualReview: boolean
	conclusion: string
}

export interface ReviewResult {
	total: number
	autoApproved: number
	manualReview: number
	rejected: number
	details: ReviewDetail[]
}

export interface ReviewReport {
	job?: {
		jobId: string
		result?: ReviewResult
	}
}
