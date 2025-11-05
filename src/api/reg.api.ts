import type { AxiosInstance, AxiosResponse } from "axios";
import type { RegApi } from "./types";
import type { SessionCredentials, SessionResponse } from "../types/session";
import { RegSessionManager } from "./reg/session-manager";
import { parseTimetable, type TimetableData } from "./reg/parser/timetable";
import { parseStudentInfo, type StudentInfo } from "./reg/parser/student";

export class RegApiClient implements RegApi {
	private sessionManager: RegSessionManager;

	constructor(private client: AxiosInstance) {
		this.sessionManager = RegSessionManager.getInstance();
	}

	public async getBuildKeyAndCookies(): Promise<{ buildKey: string | null; initialCookies: string | null }> {
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

			let cookieArray: string[] = [];

			if (response.headers["set-cookie"]) {
				cookieArray = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"] : [response.headers["set-cookie"]];
			} else if (response.headers["Set-Cookie"]) {
				cookieArray = Array.isArray(response.headers["Set-Cookie"]) ? response.headers["Set-Cookie"] : [response.headers["Set-Cookie"]];
			} else if ("rawHeaders" in response && Array.isArray(response.rawHeaders)) {
				const rawHeaders = response.rawHeaders as string[];
				for (let i = 0; i < rawHeaders.length - 1; i += 2) {
					const headerName = rawHeaders[i];
					const headerValue = rawHeaders[i + 1];
					if (headerName?.toLowerCase() === "set-cookie" && headerValue) {
						cookieArray.push(headerValue);
					}
				}
			}

			const initialCookies = cookieArray.length
				? cookieArray
						.map((cookie) => {
							const match = cookie.match(/^([^;]+)/);
							return match?.[1]?.trim() || "";
						})
						.filter((c) => c)
						.join("; ")
				: null;

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
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Language": "en-US,en;q=0.9,th;q=0.8",
			"Accept-Encoding": "gzip, deflate, br, zstd",
			"Cache-Control": "max-age=0",
			"Content-Type": "application/x-www-form-urlencoded",
			Origin: "https://reg.cmru.ac.th",
			Referer: "https://reg.cmru.ac.th/",
			"Sec-Ch-Ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"Windows"',
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-User": "?1",
			"Upgrade-Insecure-Requests": "1",
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		};

		if (initialCookies) {
			headers.Cookie = `CKLANG=0; ${initialCookies}`;
		}

		const response = await this.client.post("/registrar/validate.asp", formData, {
			headers,
			responseType: "arraybuffer",
		});

		const decoder = new TextDecoder("windows-874");
		response.data = decoder.decode(response.data);

		if (initialCookies) {
			this.sessionManager.setSession(credentials.username, credentials.password, initialCookies);
		} else {
			throw new Error("Failed to obtain session cookies from login page");
		}

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

		const cookieHeader = Array.isArray(cookies)
			? cookies
					.map((cookie) => {
						const match = cookie.match(/^([^;]+)/);
						return match?.[1]?.trim() || "";
					})
					.filter((c) => c)
					.join("; ")
			: typeof cookies === "string"
				? cookies
				: "";

		const response = await this.client.get("/registrar/time_table.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
			timeout: 30000,
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

		const cookieHeader = Array.isArray(cookies)
			? cookies
					.map((cookie) => {
						const match = cookie.match(/^([^;]+)/);
						return match?.[1]?.trim() || "";
					})
					.filter((c) => c)
					.join("; ")
			: typeof cookies === "string"
				? cookies
				: "";

		const response = await this.client.get("/registrar/student.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
			timeout: 30000,
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	public getSessionManager(): RegSessionManager {
		return this.sessionManager;
	}

	public clearSession(): void {
		this.sessionManager.clearSession();
	}
}
