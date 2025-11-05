export interface SessionData {
	cookies: string | string[];
	username: string;
	password: string;
	lastValidated: number;
}

export class BusSessionManager {
	private static instances: Map<string, BusSessionManager> = new Map();
	private sessionData: SessionData | null = null;
	private isLoggingIn: boolean = false;
	private loginPromise: Promise<void> | null = null;
	private static readonly SESSION_VALIDITY_DURATION = 5 * 60 * 1000;
	private constructor(private sessionKey: string) {}

	public static getInstance(sessionKey: string = "default"): BusSessionManager {
		if (!BusSessionManager.instances.has(sessionKey)) {
			BusSessionManager.instances.set(sessionKey, new BusSessionManager(sessionKey));
		}
		return BusSessionManager.instances.get(sessionKey)!;
	}

	public setSession(username: string, password: string, cookies: string | string[]): void {
		this.sessionData = {
			cookies,
			username,
			password,
			lastValidated: Date.now(),
		};
	}

	public hasSession(): boolean {
		return this.sessionData !== null;
	}

	public isSessionValid(): boolean {
		if (!this.sessionData) {
			return false;
		}

		const timeSinceLastValidation = Date.now() - this.sessionData.lastValidated;
		return timeSinceLastValidation < BusSessionManager.SESSION_VALIDITY_DURATION;
	}

	public updateLastValidated(): void {
		if (this.sessionData) {
			this.sessionData.lastValidated = Date.now();
		}
	}

	public getCookies(): string | string[] | null {
		return this.sessionData?.cookies || null;
	}

	public getCredentials(): { username: string; password: string } | null {
		if (!this.sessionData) {
			return null;
		}
		return {
			username: this.sessionData.username,
			password: this.sessionData.password,
		};
	}

	public clearSession(): void {
		this.sessionData = null;
		this.isLoggingIn = false;
		this.loginPromise = null;
	}

	public async ensureLoggedIn(loginFn: () => Promise<{ cookies: string | string[] }>, username?: string, password?: string): Promise<void> {
		if (this.isSessionValid()) {
			return;
		}

		if (this.isLoggingIn && this.loginPromise) {
			await this.loginPromise;
			return;
		}

		if (!username || !password) {
			const credentials = this.getCredentials();
			if (credentials) {
				username = credentials.username;
				password = credentials.password;
			} else {
				throw new Error("No credentials available for login");
			}
		}

		this.isLoggingIn = true;
		const finalUsername = username;
		const finalPassword = password;

		this.loginPromise = (async () => {
			try {
				const result = await loginFn();
				this.setSession(finalUsername, finalPassword, result.cookies);
			} finally {
				this.isLoggingIn = false;
				this.loginPromise = null;
			}
		})();

		await this.loginPromise;
	}

	public static removeInstance(sessionKey: string): void {
		BusSessionManager.instances.delete(sessionKey);
	}

	public static clearAllInstances(): void {
		BusSessionManager.instances.clear();
	}
}
