export interface ApiResponse<T = unknown> {
	data: T;
	message?: string;
	status: number;
}

export interface ApiError {
	message: string;
	status: number;
	code?: string;
}
