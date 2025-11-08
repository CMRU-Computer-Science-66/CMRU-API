import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_DIR = join(process.cwd(), "CMRU_API_STORAGE");
const TOKEN_STORAGE_FILE = join(STORAGE_DIR, "tokens.json");
const SESSION_STORAGE_FILE = join(STORAGE_DIR, "sessions.json");

interface TokenData {
	username: string;
	expiresAt: number;
	sessionData?: unknown;
}

interface SessionData {
	cookies: string | string[];
	username: string;
	lastValidated: number;
	loginTime: number;
	oneClick?: boolean;
}

export class PersistentStorage {
	private static instance: PersistentStorage;
	private tokenMap = new Map<string, TokenData>();
	private sessionMap = new Map<string, SessionData>();

	private constructor() {
		this.ensureStorageDir();
		this.loadFromDisk();
	}

	public static getInstance(): PersistentStorage {
		if (!PersistentStorage.instance) {
			PersistentStorage.instance = new PersistentStorage();
		}
		return PersistentStorage.instance;
	}

	private ensureStorageDir(): void {
		if (!existsSync(STORAGE_DIR)) {
			mkdirSync(STORAGE_DIR, { recursive: true });
		}
	}

	private loadFromDisk(): void {
		try {
			if (existsSync(TOKEN_STORAGE_FILE)) {
				const tokenData = JSON.parse(readFileSync(TOKEN_STORAGE_FILE, "utf-8"));
				for (const [key, value] of Object.entries(tokenData)) {
					this.tokenMap.set(key, value as TokenData);
				}

				const now = Date.now();
				for (const [token, data] of this.tokenMap) {
					if (data.expiresAt < now) {
						this.tokenMap.delete(token);
					}
				}
			}

			if (existsSync(SESSION_STORAGE_FILE)) {
				const sessionData = JSON.parse(readFileSync(SESSION_STORAGE_FILE, "utf-8"));
				for (const [key, value] of Object.entries(sessionData)) {
					this.sessionMap.set(key, value as SessionData);
				}
			}

			console.log(`Loaded ${this.tokenMap.size} tokens and ${this.sessionMap.size} sessions from disk`);
		} catch (error) {
			console.warn("Failed to load storage from disk:", error);
		}
	}

	private saveToDisk(): void {
		try {
			const tokenObj = Object.fromEntries(this.tokenMap);
			writeFileSync(TOKEN_STORAGE_FILE, JSON.stringify(tokenObj, null, 2));

			const sessionObj = Object.fromEntries(this.sessionMap);
			writeFileSync(SESSION_STORAGE_FILE, JSON.stringify(sessionObj, null, 2));
		} catch (error) {
			console.error("Failed to save storage to disk:", error);
		}
	}

	public setToken(token: string, data: TokenData): void {
		this.tokenMap.set(token, data);
		this.saveToDisk();
	}

	public getToken(token: string): TokenData | undefined {
		const data = this.tokenMap.get(token);
		if (data && data.expiresAt < Date.now()) {
			this.tokenMap.delete(token);
			this.saveToDisk();
			return undefined;
		}
		return data;
	}

	public deleteToken(token: string): void {
		if (this.tokenMap.delete(token)) {
			this.saveToDisk();
		}
	}

	public hasToken(token: string): boolean {
		return this.getToken(token) !== undefined;
	}

	public getAllTokens(): Map<string, TokenData> {
		const now = Date.now();
		let hasExpired = false;
		for (const [token, data] of this.tokenMap) {
			if (data.expiresAt < now) {
				this.tokenMap.delete(token);
				hasExpired = true;
			}
		}
		if (hasExpired) {
			this.saveToDisk();
		}
		return new Map(this.tokenMap);
	}

	public setSession(key: string, data: SessionData): void {
		this.sessionMap.set(key, data);
		this.saveToDisk();
	}

	public getSession(key: string): SessionData | undefined {
		return this.sessionMap.get(key);
	}

	public deleteSession(key: string): void {
		if (this.sessionMap.delete(key)) {
			this.saveToDisk();
		}
	}

	public hasSession(key: string): boolean {
		return this.sessionMap.has(key);
	}

	public getAllSessions(): Map<string, SessionData> {
		return new Map(this.sessionMap);
	}

	public cleanupExpiredTokens(): number {
		const now = Date.now();
		let cleanedCount = 0;
		for (const [token, data] of this.tokenMap) {
			if (data.expiresAt < now) {
				this.tokenMap.delete(token);
				cleanedCount++;
			}
		}
		if (cleanedCount > 0) {
			this.saveToDisk();
			console.log(`🧹 Cleaned up ${cleanedCount} expired tokens`);
		}
		return cleanedCount;
	}

	public cleanupOldSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
		const cutoffTime = Date.now() - maxAgeMs;
		let cleanedCount = 0;
		for (const [key, data] of this.sessionMap) {
			if (data.lastValidated < cutoffTime) {
				this.sessionMap.delete(key);
				cleanedCount++;
			}
		}
		if (cleanedCount > 0) {
			this.saveToDisk();
			console.log(`🧹 Cleaned up ${cleanedCount} old sessions`);
		}
		return cleanedCount;
	}

	public getStats(): { tokens: number; sessions: number; storageDir: string } {
		return {
			tokens: this.tokenMap.size,
			sessions: this.sessionMap.size,
			storageDir: STORAGE_DIR,
		};
	}
}

const storage = PersistentStorage.getInstance();
storage.cleanupExpiredTokens();
storage.cleanupOldSessions();

setInterval(
	() => {
		storage.cleanupExpiredTokens();
		storage.cleanupOldSessions();
	},
	30 * 60 * 1000,
);
