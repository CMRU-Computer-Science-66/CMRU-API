export interface SessionCredentials {
	username: string;
	password: string;
}

export interface SessionResponse {
	token?: string;
	sessionId?: string;
	refreshToken?: string;
	expiresIn?: number;
	user?: {
		id: string | number;
		username: string;
		email?: string;
		[key: string]: unknown;
	};
}

export interface SessionError {
	message: string;
	code?: string;
	status: number;
}
