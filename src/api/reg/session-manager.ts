export interface RegSessionData {
	cookies: string | string[];
	username: string;
	password: string;
	loginTime: number;
}

export class RegSessionManager {
	private static instance: RegSessionManager | null = null;
	private sessionData: RegSessionData | null = null;

	private constructor() {}

	public static getInstance(): RegSessionManager {
		if (!RegSessionManager.instance) {
			RegSessionManager.instance = new RegSessionManager();
		}
		return RegSessionManager.instance;
	}

	public setSession(username: string, password: string, cookies: string | string[]): void {
		this.sessionData = {
			cookies,
			username,
			password,
			loginTime: Date.now(),
		};
	}

	public hasSession(): boolean {
		return this.sessionData !== null;
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

	public getSessionData(): RegSessionData | null {
		return this.sessionData;
	}

	public clearSession(): void {
		this.sessionData = null;
	}

	public getLoginTime(): number | null {
		return this.sessionData?.loginTime || null;
	}

	public static clearInstance(): void {
		if (RegSessionManager.instance) {
			RegSessionManager.instance.clearSession();
			RegSessionManager.instance = null;
		}
	}
}
