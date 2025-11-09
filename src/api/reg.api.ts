import type { AxiosInstance, AxiosResponse } from "axios";
import type { RegApi } from "./types";
import type { SessionCredentials, SessionResponse } from "../types/session";
import { SessionManager } from "./manager/session-manager";
import { parseTimetable, type TimetableData } from "./reg/parser/timetable";
import { parseStudentInfo, type StudentInfo } from "./reg/parser/student";
import { generateRandomUserAgent } from "./utilities/user-agent";
import { parseSetCookieHeader, formatCookies } from "./manager/cookie-manager";

export class RegApiClient implements RegApi {
	private sessionManager: SessionManager;

	constructor(
		private client: AxiosInstance,
		sessionKey: string = "reg",
	) {
		this.sessionManager = SessionManager.forRegApi(sessionKey);
	}

	public getSessionManager(): SessionManager {
		return this.sessionManager;
	}

	public async getBuildKeyAndCookies(): Promise<{ buildKey: string | null; initialCookies: string[] | null }> {
		try {
			const response = await this.client.get("/registrar/login.asp", {
				responseType: "arraybuffer",
				maxRedirects: 0,
				validateStatus: (status) => status >= 200 && status < 400,
			});

			const decoder = new TextDecoder("windows-874");
			const html = decoder.decode(response.data);
			const buildKeyMatch = html.match(/NAME=BUILDKEY\s+value=(\d+)/i);
			const buildKey = buildKeyMatch?.[1] ?? null;
			const initialCookies = parseSetCookieHeader(response);

			return { buildKey, initialCookies };
		} catch (error) {
			console.error("Failed to get BUILDKEY and cookies:", error);
			return { buildKey: null, initialCookies: null };
		}
	}

	public async getBuildKey(): Promise<string | null> {
		const { buildKey } = await this.getBuildKeyAndCookies();
		return buildKey;
	}

	public async login(credentials: SessionCredentials, buildKey?: string): Promise<AxiosResponse<SessionResponse>> {
		const { buildKey: fetchedBuildKey, initialCookies } = await this.getBuildKeyAndCookies();

		const finalBuildKey = buildKey || fetchedBuildKey || undefined;

		const formData = new URLSearchParams();
		formData.append("f_uid", credentials.username);
		formData.append("f_pwd", credentials.password);

		if (finalBuildKey) {
			formData.append("BUILDKEY", finalBuildKey);
		}

		const headers: Record<string, string> = {
			"User-Agent": generateRandomUserAgent(),
			"Content-Type": "application/x-www-form-urlencoded",
			"Upgrade-Insecure-Requests": "1",
		};

		if (initialCookies) {
			const cookieString = formatCookies(initialCookies);
			headers.Cookie = cookieString;
		}

		const response = await this.client.post("/registrar/validate.asp", formData, {
			headers,
			responseType: "arraybuffer",
		});

		const decoder = new TextDecoder("windows-874");
		response.data = decoder.decode(response.data);

		const sessionCookies = parseSetCookieHeader(response);

		let finalCookies: string[];
		if (sessionCookies && sessionCookies.length > 0) {
			finalCookies = sessionCookies;
		} else if (initialCookies) {
			finalCookies = initialCookies;
		} else {
			throw new Error("Failed to obtain session cookies from login");
		}

		this.sessionManager.setSession(credentials.username, credentials.password, finalCookies);

		return response as AxiosResponse<SessionResponse>;
	}
	public async getTimeTable(): Promise<TimetableData> {
		const response = await this.getTimeTableRaw();
		return parseTimetable(response.data);
	}

	public async getTimeTableRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);
		const response = await this.client.get("/registrar/time_table.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	public async getStudentInfo(): Promise<StudentInfo> {
		const response = await this.getStudentInfoRaw();
		return parseStudentInfo(response.data);
	}

	public async getStudentInfoRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);

		const response = await this.client.get("/registrar/student.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data && response.data.byteLength > 0) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	public clearSession(): void {
		this.sessionManager.clearSession();
	}
}
