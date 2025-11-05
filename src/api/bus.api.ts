import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import type { BusApi } from "./types";
import { SessionManager } from "./manager/session-manager";
import { parseScheduleHTML, type ParsedScheduleData } from "./bus/parser/schedule";
import { parseAvailableBusHTML, type AvailableBusData } from "./bus/parser/available";
import type { SessionCredentials } from "../types/session";
import { generateRandomUserAgent } from "./utilities/user-agent";
import { formatCookies } from "./manager/cookie-manager";

export class CmruBusApiClient implements BusApi {
	private sessionManager: SessionManager;

	constructor(
		private client: AxiosInstance,
		sessionKey: string = "bus",
	) {
		this.sessionManager = SessionManager.forBusApi(sessionKey);
	}

	private generateHeaders(): Record<string, string> {
		return {
			"User-Agent": generateRandomUserAgent(),
			"Upgrade-Insecure-Requests": "1",
		};
	}

	async login<T = unknown>(credentials: SessionCredentials): Promise<AxiosResponse<T>> {
		const response = await this.getSession<T>(credentials.username, credentials.password);

		if (response.headers["set-cookie"]) {
			this.sessionManager.setSession(credentials.username, credentials.password, response.headers["set-cookie"]);
		}

		return response;
	}

	public clearSession(): void {
		this.sessionManager.clearSession();
	}

	public getSessionManager(): SessionManager {
		return this.sessionManager;
	}

	private async ensureAuthenticated(): Promise<void> {
		await this.sessionManager.ensureLoggedIn(async () => {
			const credentials = this.sessionManager.getCredentials();
			if (!credentials) {
				throw new Error("No credentials available for auto re-login");
			}
			const response = await this.getSession(credentials.username, credentials.password);
			if (!response.headers["set-cookie"]) {
				throw new Error("Login failed - no cookies received");
			}
			return { cookies: response.headers["set-cookie"] };
		});
	}

	public async validateSession(): Promise<boolean> {
		try {
			if (!this.sessionManager.hasSession()) {
				return false;
			}

			const cookies = this.sessionManager.getCookies();
			if (!cookies) {
				return false;
			}

			await this.getScheduleRaw(cookies);

			this.sessionManager.updateLastValidated();
			return true;
		} catch (error) {
			if (error instanceof Error && error.message.includes("Session expired")) {
				this.sessionManager.clearSession();
			}
			return false;
		}
	}

	public async getSession<T = unknown>(username: string, password: string, retries = 3): Promise<AxiosResponse<T>> {
		const data = `${username}:||:${password}:||:1`;
		const encodedData = encodeURIComponent(data);

		const headers = this.generateHeaders();

		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				"X-Requested-With": "XMLHttpRequest",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				const response = await this.client.get<T>(`/user/userloginchk?data=${encodedData}`, config);

				if (response.status === 302 || response.status === 301) {
					throw new Error("Login failed - invalid username or password");
				}

				if (response.status !== 200) {
					throw new Error(`Unexpected login response status: ${response.status}`);
				}

				return response;
			} catch (error) {
				if (error instanceof Error && error.message.includes("timeout") && attempt < retries) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
					continue;
				}

				throw error;
			}
		}

		throw new Error("Login failed after all retry attempts");
	}

	public async getScheduleRaw<T = unknown>(cookies?: string | string[]): Promise<AxiosResponse<T>> {
		if (!cookies) {
			await this.ensureAuthenticated();
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available. Please call login() first or provide cookies manually.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: "https://cmrubus.cmru.ac.th/",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const response = await this.client.get<T>("/users/schedule/showall", config);

		if (response.status === 302 || response.status === 301) {
			const location = response.headers["location"];

			if (location === "https://cmrubus.cmru.ac.th/" || location === "/") {
				throw new Error("Session expired or invalid. Please login again.");
			}
		}

		if (response.status !== 200) {
			throw new Error(`Unexpected response status: ${response.status}`);
		}

		if (typeof response.data === "string") {
			const htmlData = response.data as string;
			if (htmlData.includes("userloginchk") || (htmlData.includes("ระบบจองการใช้บริการรถรับ-ส่ง") && !htmlData.includes("รายการจอง"))) {
				throw new Error("Session expired - received login page instead of schedule data");
			}
		}

		return response;
	}

	public async getSchedule(cookies?: string | string[]): Promise<ParsedScheduleData> {
		const response = await this.getScheduleRaw<string>(cookies);
		const htmlData = response.data;
		return parseScheduleHTML(htmlData);
	}

	public async confirmReservation(data: string, cookies?: string | string[]): Promise<AxiosResponse<string>> {
		if (!cookies) {
			await this.ensureAuthenticated();
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available. Please call login() first or provide cookies manually.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: "https://cmrubus.cmru.ac.th/users/schedule/showall",
				"X-Requested-With": "XMLHttpRequest",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const encodedData = encodeURIComponent(data);
		const url = `/users/schedule/confirmreserv?data=${encodedData}`;
		const response = await this.client.get<string>(url, config);

		if (response.status !== 200) {
			throw new Error(`Failed to confirm reservation: ${response.status}`);
		}

		return response;
	}

	public async cancelReservation(data: string, cookies?: string | string[]): Promise<AxiosResponse<string>> {
		if (!cookies) {
			await this.ensureAuthenticated();
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available. Please call login() first or provide cookies manually.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: "https://cmrubus.cmru.ac.th/users/schedule/showall",
				"X-Requested-With": "XMLHttpRequest",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const encodedData = encodeURIComponent(data);
		const url = `/users/schedule/unconfirmreserv?data=${encodedData}`;
		const response = await this.client.get<string>(url, config);

		if (response.status !== 200) {
			throw new Error(`Failed to cancel reservation: ${response.status}`);
		}

		return response;
	}

	public async unconfirmReservation(data: string, cookies?: string | string[]): Promise<AxiosResponse<string>> {
		return this.cancelReservation(data, cookies);
	}

	public async getBusStops<T = unknown>(): Promise<AxiosResponse<T>> {
		return this.client.get<T>("/bus-stops");
	}

	public async getAvailableBusesRaw<T = unknown>(month?: string, cookies?: string | string[]): Promise<AxiosResponse<T>> {
		if (!cookies) {
			await this.ensureAuthenticated();
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available. Please call login() first or provide cookies manually.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: "https://cmrubus.cmru.ac.th/",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const url = month ? `/schedule/showevent?month=${month}` : "/schedule/showevent";
		const response = await this.client.get<T>(url, config);

		if (response.status === 302 || response.status === 301) {
			const location = response.headers["location"];

			if (location === "https://cmrubus.cmru.ac.th/" || location === "/") {
				throw new Error("Session expired or invalid. Please login again.");
			}
		}

		if (response.status !== 200) {
			throw new Error(`Unexpected response status: ${response.status}`);
		}

		return response;
	}

	public async getAvailableBuses(month?: string, cookies?: string | string[]): Promise<AvailableBusData> {
		const response = await this.getAvailableBusesRaw<string>(month, cookies);
		const htmlData = response.data;
		return parseAvailableBusHTML(htmlData);
	}

	public async bookBus(scheduleId: number, scheduleDate: string, destinationType: 1 | 2, cookies?: string | string[]): Promise<AxiosResponse<number>> {
		if (!cookies) {
			await this.ensureAuthenticated();
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available. Please call login() first or provide cookies manually.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: "https://cmrubus.cmru.ac.th/schedule/showevent",
				"X-Requested-With": "XMLHttpRequest",
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const data = `${scheduleId}:||:${scheduleDate}:||:${destinationType}`;
		const encodedData = encodeURIComponent(data);
		const url = `/schedule/saveschereserv?data=${encodedData}`;
		const response = await this.client.get<number>(url, config);

		if (response.status !== 200) {
			throw new Error(`Failed to book bus: ${response.status}`);
		}

		return response;
	}
}
