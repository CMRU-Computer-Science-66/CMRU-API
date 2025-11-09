import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import type { BusApi } from "./types";
import { SessionManager } from "./manager/session-manager";
import { parseScheduleHTML, type ParsedScheduleData } from "./bus/parser/schedule";
import { parseAvailableBusHTML, type AvailableBusData } from "./bus/parser/available";
import { parseTicketHTML, type TicketInfo } from "./bus/parser/ticket";
import type { SessionCredentials } from "../types/session";
import { generateRandomUserAgent } from "./utilities/user-agent";
import { formatCookies } from "./manager/cookie-manager";

type LoginResponseCode = 1 | 2 | 3 | 5 | 8 | "EMPTY" | "OTHER";

export enum UserType {
	STUDENT = "1",
	STAFF = "2",
}

export class CmruBusApiClient implements BusApi {
	private sessionManager: SessionManager;

	constructor(
		private client: AxiosInstance,
		sessionKey: string = "bus",
	) {
		const uniqueSessionKey = `${sessionKey}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
		this.sessionManager = SessionManager.forBusApi(uniqueSessionKey);
	}

	private generateHeaders(): Record<string, string> {
		return {
			"User-Agent": generateRandomUserAgent(),
			"Upgrade-Insecure-Requests": "1",
		};
	}

	private parseSetCookie(raw: string | string[] | null): string {
		if (!raw) return "";
		if (Array.isArray(raw)) {
			return raw
				.map((cookie) => (cookie.split(";")[0] ?? "").trim())
				.filter(Boolean)
				.join("; ");
		}
		const parts = raw.split(/,(?=\s*\w+=)/);
		const cookies = parts.map((s) => (s.split(";")[0] ?? "").trim());
		return cookies.join("; ");
	}

	private interpretLoginResponse(text: string): LoginResponseCode {
		const t = (text ?? "").trim();
		if (t === "") return "EMPTY";
		if (["1", "2", "3", "5", "8"].includes(t)) return Number(t) as LoginResponseCode;
		return "OTHER";
	}

	private createLoginPayload(username: string, password: string, userType: UserType = UserType.STUDENT): string {
		return `${username}:||:${password}:||:${userType}`;
	}

	async login<T = unknown>(credentials: SessionCredentials): Promise<AxiosResponse<T>> {
		return this.loginWith<T>(credentials, UserType.STUDENT);
	}

	async loginWith<T = unknown>(credentials: SessionCredentials, userType: UserType = UserType.STUDENT): Promise<AxiosResponse<T>> {
		const response = await this.getSession<T>(credentials.username, credentials.password, userType);

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

			const response = await this.getSession(credentials.username, credentials.password, UserType.STUDENT);

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

	public async getSession<T = unknown>(username: string, password: string, userType: UserType = UserType.STUDENT, retries = 3): Promise<AxiosResponse<T>> {
		const loginPage = "/user/login";
		const checkUrl = "/user/userloginchk";
		const headers = this.generateHeaders();

		let cookieHeader = "";
		try {
			const bootResponse = await this.client.get(loginPage, {
				headers: {
					Accept: "text/html,application/xhtml+xml",
					...headers,
				},
				validateStatus: (status) => status >= 200 && status < 400,
			});

			cookieHeader = this.parseSetCookie(bootResponse.headers["set-cookie"] || null);
		} catch (error) {
			console.warn("Failed to get initial session cookie:", error);
		}

		const data = this.createLoginPayload(username, password, userType);

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				let text = "";
				let code: LoginResponseCode = "EMPTY";
				let successResponse: AxiosResponse<string> | null = null;

				try {
					const formData = new URLSearchParams({ data });
					const postConfig: AxiosRequestConfig = {
						withCredentials: true,
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							"X-Requested-With": "XMLHttpRequest",
							Accept: "*/*",
							...(cookieHeader ? { Cookie: cookieHeader } : {}),
							Referer: `https://cmrubus.cmru.ac.th${loginPage}`,
							...headers,
						},
						validateStatus: (status) => status >= 200 && status < 400,
						responseType: "text",
					};

					const postResponse = await this.client.post<string>(checkUrl, formData.toString(), postConfig);
					text = String(postResponse.data ?? "");
					code = this.interpretLoginResponse(text);
					successResponse = postResponse;
				} catch (postError) {
					console.warn("POST method failed, will try GET:", postError);
				}

				if (code === "EMPTY" || code === "OTHER") {
					const url = `${checkUrl}?data=${encodeURIComponent(data)}`;
					const getConfig: AxiosRequestConfig = {
						withCredentials: true,
						headers: {
							"X-Requested-With": "XMLHttpRequest",
							Accept: "*/*",
							...(cookieHeader ? { Cookie: cookieHeader } : {}),
							Referer: `https://cmrubus.cmru.ac.th${loginPage}`,
							...headers,
						},
						validateStatus: (status) => status >= 200 && status < 400,
						responseType: "text",
					};

					const getResponse = await this.client.get<string>(url, getConfig);
					text = String(getResponse.data ?? "");
					code = this.interpretLoginResponse(text);
					successResponse = getResponse;
				}

				if (code === 1 || code === 2 || code === 3) {
					if (successResponse && successResponse.headers["set-cookie"]) {
						return successResponse as AxiosResponse<T>;
					}

					if (successResponse) {
						return successResponse as AxiosResponse<T>;
					}

					throw new Error("Login succeeded but no response available");
				} else if (code === 5) {
					throw new Error("Login blocked (code 5): ต้องปรับปรุงข้อมูลบุคลากรที่ ePersonal");
				} else if (code === 8) {
					throw new Error("Login blocked (code 8): ให้บริการเฉพาะนักศึกษาวิทยาเขตแม่ริม");
				} else if (code === "EMPTY") {
					throw new Error("Login failed: Empty response (invalid username/password or session issue)");
				} else {
					throw new Error(`Login failed: Unexpected response - ${JSON.stringify(text)}`);
				}
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

	public async getScheduleRaw<T = unknown>(cookies?: string | string[], page?: number, _perPage?: number): Promise<AxiosResponse<T>> {
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

		const url = `/users/schedule/showall/${page || 1}/`;
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

		if (typeof response.data === "string") {
			const htmlData = response.data as string;
			if (htmlData.includes("userloginchk") || (htmlData.includes("ระบบจองการใช้บริการรถรับ-ส่ง") && !htmlData.includes("รายการจอง"))) {
				throw new Error("Session expired - received login page instead of schedule data");
			}
		}

		return response;
	}

	public async getSchedule(cookies?: string | string[], page: number = 1, perPage: number = 10): Promise<ParsedScheduleData> {
		const allReservations: ParsedScheduleData["reservations"] = [];
		let totalReservations = 0;
		let userInfo = { name: "" };
		let serverPage = 1;

		const firstResponse = await this.getScheduleRaw<string>(cookies, serverPage);
		const firstData = parseScheduleHTML(firstResponse.data);
		totalReservations = firstData.totalReservations;
		userInfo = firstData.userInfo;
		allReservations.push(...firstData.reservations);

		while (allReservations.length < totalReservations) {
			serverPage++;
			try {
				const response = await this.getScheduleRaw<string>(cookies, serverPage);
				const parsedData = parseScheduleHTML(response.data);

				if (parsedData.reservations.length === 0) {
					break;
				}

				allReservations.push(...parsedData.reservations);
			} catch {
				break;
			}
		}

		const totalPages = Math.ceil(totalReservations / perPage);
		const startIndex = (page - 1) * perPage;
		const endIndex = startIndex + perPage;
		const paginatedReservations = allReservations.slice(startIndex, endIndex);

		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		return {
			userInfo,
			totalReservations,
			currentPage: page,
			totalPages,
			hasNextPage,
			hasPrevPage,
			reservations: paginatedReservations,
		};
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

	public async cancelReservation(reservationId: string | number, cookies?: string | string[]): Promise<AxiosResponse<string>> {
		return this.deleteReservation(reservationId, cookies);
	}

	public async unconfirmReservation(data: string, cookies?: string | string[], oneClick: boolean = false): Promise<AxiosResponse<string>> {
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

		if (response.status !== 200 && response.status !== 302) {
			throw new Error(`Failed to unconfirm reservation: ${response.status}`);
		}

		if (oneClick) {
			try {
				const schedule = await this.getSchedule(cookiesToUse);
				const [countIdStr] = data.split(":||:");
				const reservation = schedule.reservations.find((reservation) => {
					const reservationData = reservation.confirmation.unconfirmData || reservation.confirmation.confirmData;
					return reservationData && reservationData.includes(countIdStr || "");
				});

				if (reservation && reservation.actions.reservationId) {
					await this.deleteReservation(reservation.actions.reservationId, cookiesToUse);
				}
			} catch (error) {
				throw new Error(`Unconfirm succeeded but auto-deletion failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		return response;
	}

	public async deleteReservation(reservationId: string | number, cookies?: string | string[]): Promise<AxiosResponse<string>> {
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

		const url = `/users/schedule/delt/${reservationId}`;
		const response = await this.client.get<string>(url, config);

		if (response.status !== 200 && response.status !== 302 && response.status !== 307) {
			throw new Error(`Failed to delete reservation: ${response.status}`);
		}

		return response;
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

	public async bookBus(scheduleId: number, scheduleDate: string, destinationType: 1 | 2, cookies?: string | string[], oneClick: boolean = false): Promise<AxiosResponse<number>> {
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

		if (oneClick) {
			try {
				const schedule = await this.getSchedule(cookiesToUse);
				const targetDate = new Date(scheduleDate);
				const reservation = schedule.reservations.find((r) => {
					const resDate = new Date(r.date);
					return (
						resDate.getFullYear() === targetDate.getFullYear() &&
						resDate.getMonth() === targetDate.getMonth() &&
						resDate.getDate() === targetDate.getDate() &&
						r.confirmation.canConfirm
					);
				});

				if (!reservation || !reservation.confirmation.confirmData) {
					throw new Error("Booking succeeded but could not find reservation for auto-confirmation");
				}

				await this.confirmReservation(reservation.confirmation.confirmData, cookiesToUse);
			} catch (error) {
				throw new Error(`Booking succeeded but auto-confirmation failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		return response;
	}

	public async getTicket<T = unknown>(showticketUrl: string, cookies?: string | string[]): Promise<AxiosResponse<T>> {
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
			},
			maxRedirects: 0,
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const response = await this.client.get<T>(showticketUrl, config);

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

	public async getTicketInfo(showticketUrl: string, cookies?: string | string[]): Promise<TicketInfo> {
		const response = await this.getTicket<string>(showticketUrl, cookies);
		const htmlData = response.data;
		return parseTicketHTML(htmlData);
	}

	public async getTicketQRCodeImage(showticketUrl: string, cookies?: string | string[]): Promise<AxiosResponse<Buffer>> {
		const ticketInfo = await this.getTicketInfo(showticketUrl, cookies);
		const qrImageUrl = ticketInfo.qrCode.imageUrl;

		if (!qrImageUrl) {
			throw new Error("QR code image URL not found in ticket");
		}

		const cookiesToUse = cookies || this.sessionManager.getCookies();

		if (!cookiesToUse) {
			throw new Error("No authentication cookies available.");
		}

		const cookieString = formatCookies(cookiesToUse);
		const headers = this.generateHeaders();
		const fullQrImageUrl = qrImageUrl.startsWith("http") ? qrImageUrl : `https://cmrubus.cmru.ac.th${qrImageUrl}`;

		const config: AxiosRequestConfig = {
			withCredentials: true,
			headers: {
				...headers,
				Cookie: cookieString,
				Referer: `https://cmrubus.cmru.ac.th${showticketUrl}`,
			},
			responseType: "arraybuffer",
			validateStatus: (status) => {
				return status >= 200 && status < 400;
			},
		};

		const response = await this.client.get<Buffer>(fullQrImageUrl, config);

		if (response.status !== 200) {
			throw new Error(`Failed to get QR code image: ${response.status}`);
		}

		return response;
	}
}
