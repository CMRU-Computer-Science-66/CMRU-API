export interface SessionData {
	cookies: string | string[];
	username: string;
	password: string;
	lastValidated: number;
	loginTime: number;
	oneClick?: boolean;
}

export type SessionType = "bus" | "reg";
export interface SessionConfig {
	validityDuration?: number;
	autoRelogin?: boolean;
	type?: SessionType;
}

const DEFAULT_CONFIG: Required<SessionConfig> = {
	validityDuration: 10 * 60 * 1000,
	autoRelogin: true,
	type: "bus",
};

export class SessionManager {
	private static instances: Map<string, SessionManager> = new Map();
	private sessionData: SessionData | null = null;
	private isLoggingIn: boolean = false;
	private loginPromise: Promise<void> | null = null;
	private config: Required<SessionConfig>;

	private constructor(
		private sessionKey: string,
		config?: SessionConfig,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	public static getInstance(sessionKey: string = "default", config?: SessionConfig): SessionManager {
		if (!SessionManager.instances.has(sessionKey)) {
			SessionManager.instances.set(sessionKey, new SessionManager(sessionKey, config));
		}
		return SessionManager.instances.get(sessionKey)!;
	}

	public setSession(username: string, password: string, cookies: string | string[], oneClick?: boolean): void {
		const now = Date.now();
		this.sessionData = {
			cookies,
			username,
			password,
			lastValidated: now,
			loginTime: now,
			oneClick,
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
		return timeSinceLastValidation < this.config.validityDuration;
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

	public getSessionData(): SessionData | null {
		return this.sessionData;
	}

	public getOneClickEnabled(): boolean {
		return this.sessionData?.oneClick || false;
	}

	public setOneClickEnabled(enabled: boolean): void {
		if (this.sessionData) {
			this.sessionData.oneClick = enabled;
		}
	}

	public getLoginTime(): number | null {
		return this.sessionData?.loginTime || null;
	}

	public getSessionAge(): number | null {
		if (!this.sessionData) {
			return null;
		}
		return Date.now() - this.sessionData.loginTime;
	}

	public getTimeSinceValidation(): number | null {
		if (!this.sessionData) {
			return null;
		}
		return Date.now() - this.sessionData.lastValidated;
	}

	public clearSession(): void {
		this.sessionData = null;
		this.isLoggingIn = false;
		this.loginPromise = null;

		SessionManager.removeInstance(this.sessionKey);
	}

	public async ensureLoggedIn(loginFn: () => Promise<{ cookies: string | string[] }>, username?: string, password?: string): Promise<void> {
		if (this.isSessionValid()) {
			return;
		}

		if (this.isLoggingIn && this.loginPromise) {
			await this.loginPromise;
			return;
		}

		if (!this.config.autoRelogin) {
			throw new Error("Session expired and auto re-login is disabled. Please login again.");
		}

		if (!username || !password) {
			const credentials = this.getCredentials();
			if (credentials) {
				username = credentials.username;
				password = credentials.password;
			} else {
				throw new Error("No credentials available for auto re-login");
			}
		}

		this.isLoggingIn = true;
		const finalUsername = username;
		const finalPassword = password;

		this.loginPromise = (async () => {
			try {
				const result = await loginFn();
				this.setSession(finalUsername, finalPassword, result.cookies);
			} catch (error) {
				this.clearSession();
				throw error;
			} finally {
				this.isLoggingIn = false;
				this.loginPromise = null;
			}
		})();

		await this.loginPromise;
	}

	public getConfig(): Required<SessionConfig> {
		return { ...this.config };
	}

	public updateConfig(config: Partial<SessionConfig>): void {
		this.config = { ...this.config, ...config };
	}

	public getType(): SessionType {
		return this.config.type;
	}

	public isAutoReloginEnabled(): boolean {
		return this.config.autoRelogin;
	}

	public isLoginInProgress(): boolean {
		return this.isLoggingIn;
	}

	public static removeInstance(sessionKey: string): void {
		const instance = SessionManager.instances.get(sessionKey);
		if (instance) {
			instance.clearSession();
			SessionManager.instances.delete(sessionKey);
		}
	}

	public static clearAllInstances(): void {
		SessionManager.instances.forEach((instance) => instance.clearSession());
		SessionManager.instances.clear();
	}

	public static getActiveSessionKeys(): string[] {
		return Array.from(SessionManager.instances.keys());
	}

	public static getActiveSessionCount(): number {
		return SessionManager.instances.size;
	}

	public static hasInstance(sessionKey: string): boolean {
		return SessionManager.instances.has(sessionKey);
	}

	public static forBusApi(sessionKey: string = "bus_default"): SessionManager {
		return SessionManager.getInstance(sessionKey, {
			type: "bus",
			autoRelogin: true,
			validityDuration: 5 * 60 * 1000, // 5 minutes
		});
	}

	public static forRegApi(sessionKey: string = "reg_default"): SessionManager {
		return SessionManager.getInstance(sessionKey, {
			type: "reg",
			autoRelogin: false,
			validityDuration: 10 * 60 * 1000, // 10 minutes
		});
	}
}
