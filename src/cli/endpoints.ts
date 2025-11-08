import type { BusApi, RegApi } from "../api/types";
import { UserType } from "../api/bus.api";
import { decryptCredentials, validateEncryptedCredentials } from "../api/utilities/crypto-utils";
import { logger } from "./logger";
import { PersistentStorage } from "./storage/persistent-storage";

export const API_ENDPOINTS = {
	health: "GET /health",
	bus: {
		login: "POST /bus/login",
		loginWith: "POST /bus/login-with",
		availableBuses: "GET /bus/available",
		schedule: "GET /bus/schedule?page={number}&perPage={number}",
		confirmReservation: "POST /bus/confirm",
		unconfirmReservation: "POST /bus/unconfirm",
		deleteReservation: "POST /bus/delete",
		cancelReservation: "POST /bus/cancel",
		bookBus: "POST /bus/book",
		validateSession: "GET /bus/validate",
		ticketQRCode: "GET /bus/ticket/qrcode?ticketId={number}",
		ticketInfo: "GET /bus/ticket/info?ticketId={number}",
	},
	reg: {
		login: "POST /reg/login",
		studentInfo: "GET /reg/student",
		timetable: "GET /reg/timetable",
	},
} as const;

export type EndpointHandler = (body?: unknown, query?: URLSearchParams, headers?: Record<string, string>) => Promise<unknown>;

export interface RouteConfig {
	method: "GET" | "POST";
	path: string;
	handler: EndpointHandler;
	requiresAuth?: boolean;
}

const storage = PersistentStorage.getInstance();

function generateToken(username: string): string {
	const timestamp = Date.now().toString(36);
	let randomString = "";

	while (randomString.length < 64 - timestamp.length) {
		randomString += Math.random().toString(36).slice(2);
	}

	const token = (timestamp + randomString).slice(0, 64);

	const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
	storage.setToken(token, { username, expiresAt });
	return token;
}

function validateToken(token: string): { username: string } | null {
	const tokenData = storage.getToken(token);
	if (!tokenData) return null;

	return { username: tokenData.username };
}

function extractBearerToken(headers: Record<string, string>): string | null {
	const authHeader = headers.authorization || headers.Authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return null;
	}
	return authHeader.slice(7);
}

export function authenticateRequest(headers: Record<string, string>): { username: string } | null {
	const token = extractBearerToken(headers);
	if (!token) return null;
	return validateToken(token);
}

export class ApiError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public errorType: "validation" | "auth" | "session" | "network" | "server" | "unknown",
	) {
		super(message);
		this.name = "ApiError";
	}
}

function handleApiError(error: unknown): never {
	if (error instanceof ApiError) {
		throw error;
	}

	if (error instanceof Error) {
		const message = error.message;
		const messageLower = message.toLowerCase();

		if (message.includes("กรุณาป้อนรหัสประจำตัวและรหัสผ่านให้ถูกต้อง")) {
			throw new ApiError(message, 401, "auth");
		}

		if (message.includes("ไม่สามารถเข้าสู่ระบบได้เนื่องจากระบุรหัสผิดเกิน")) {
			throw new ApiError(message, 429, "auth");
		}

		if (messageLower.includes("invalid username or password") || messageLower.includes("login failed")) {
			throw new ApiError(message, 401, "auth");
		}

		if (messageLower.includes("session expired") || messageLower.includes("please login again")) {
			throw new ApiError("Session expired. Please login again", 401, "session");
		}

		if (messageLower.includes("no authentication cookies") || messageLower.includes("no credentials available")) {
			throw new ApiError("Authentication required. Please login first", 401, "auth");
		}

		if (messageLower.includes("timeout") || messageLower.includes("network") || messageLower.includes("econnrefused")) {
			throw new ApiError("Network error. Please try again", 503, "network");
		}

		if (messageLower.includes("unexpected response status") || messageLower.includes("failed to")) {
			throw new ApiError(error.message, 502, "server");
		}

		throw new ApiError(error.message, 500, "unknown");
	}

	throw new ApiError("An unexpected error occurred", 500, "unknown");
}

export function createRoutes(busApi: BusApi, regApi: RegApi, _busApiFactory?: () => BusApi): RouteConfig[] {
	async function ensureValidSession(username: string): Promise<void> {
		try {
			const isValid = await busApi.validateSession();

			if (isValid) {
				const storedSession = storage.getSession(username);
				if (storedSession) {
					storedSession.lastValidated = Date.now();
					storage.setSession(username, storedSession);
				}
				return;
			}
			// eslint-disable-next-line no-empty
		} catch {}

		throw new ApiError("Session expired. Please login again", 401, "session");
	}

	return [
		{
			method: "GET",
			path: "/health",
			handler: async () => {
				const uptime = process.uptime();
				const memoryUsage = process.memoryUsage();
				const timestamp = new Date().toISOString();

				let busApiStatus = "unknown";
				let regApiStatus = "unknown";

				try {
					await busApi.validateSession();
					busApiStatus = "connected";
				} catch (error) {
					if (error instanceof Error && error.message.includes("Authentication required")) {
						busApiStatus = "connected";
					} else {
						busApiStatus = "error";
					}
				}

				try {
					await regApi.getStudentInfo();
					regApiStatus = "connected";
				} catch (error) {
					if (error instanceof Error && error.message.includes("Authentication required")) {
						regApiStatus = "connected";
					} else {
						regApiStatus = "error";
					}
				}

				return {
					status: "healthy",
					timestamp,
					uptime: Math.floor(uptime),
					memory: {
						rss: Math.round(memoryUsage.rss / 1024 / 1024),
						heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
						heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
						external: Math.round(memoryUsage.external / 1024 / 1024),
					},
					apis: {
						bus: busApiStatus,
						reg: regApiStatus,
					},
					storage: storage.getStats(),
					version: process.env.npm_package_version || "unknown",
					runtime: typeof Bun !== "undefined" ? "Bun" : "Node.js",
				};
			},
		},
		{
			method: "POST",
			path: "/bus/login",
			handler: async (body) => {
				try {
					let username: string;
					let password: string;

					const bodyData = body as {
						encrypted?: boolean;
						encryptedUsername?: string;
						encryptedPassword?: string;
						username?: string;
						password?: string;
					};

					if (bodyData.encrypted && bodyData.encryptedUsername && bodyData.encryptedPassword) {
						if (!validateEncryptedCredentials(bodyData)) {
							throw new ApiError("Invalid encrypted credentials format", 400, "validation");
						}

						const pin = (globalThis as { encryptionPin?: string }).encryptionPin || "kdawojdoajwdoimawdmaow";

						try {
							const decrypted = decryptCredentials(
								{
									encryptedUsername: bodyData.encryptedUsername,
									encryptedPassword: bodyData.encryptedPassword,
								},
								pin,
							);

							username = decrypted.username;
							password = decrypted.password;
						} catch (decryptError) {
							logger.error("Failed to decrypt credentials:", decryptError);
							throw new ApiError("Invalid encryption or corrupted credentials", 401, "auth");
						}
					} else {
						if (!bodyData.username || !bodyData.password) {
							throw new ApiError("Username and password are required", 400, "validation");
						}

						username = bodyData.username;
						password = bodyData.password;
					}

					await busApi.login({ username, password });
					const token = generateToken(username);
					const sessionManager = busApi.getSessionManager();
					const sessionData = sessionManager.getSessionData();

					storage.setSession(username, {
						cookies: sessionData?.cookies || "",
						username,
						lastValidated: Date.now(),
						loginTime: Date.now(),
						oneClick: sessionData?.oneClick || false,
					});

					return { success: true, message: "Logged in successfully", token };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: false,
		},
		{
			method: "POST",
			path: "/bus/login-with",
			handler: async (body) => {
				try {
					const { username, password, userType } = body as { username?: string; password?: string; userType?: UserType };

					if (!username || !password) {
						throw new ApiError("Username and password are required", 400, "validation");
					}

					if (userType !== undefined && userType !== UserType.STUDENT && userType !== UserType.STAFF) {
						throw new ApiError("userType must be either '1' (STUDENT) or '2' (STAFF)", 400, "validation");
					}

					await busApi.loginWith({ username, password }, userType);
					return { success: true, message: "Logged in successfully" };
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "GET",
			path: "/bus/available",
			handler: async () => {
				try {
					return await busApi.getAvailableBuses();
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "GET",
			path: "/bus/schedule",
			handler: async (_body, query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const pageParam = query?.get("page");
					const perPageParam = query?.get("perPage");
					const page = pageParam ? parseInt(pageParam, 10) : undefined;
					const perPage = perPageParam ? parseInt(perPageParam, 10) : 10;

					if (pageParam && (isNaN(page!) || page! < 1)) {
						throw new ApiError("Page must be a positive number", 400, "validation");
					}

					if (perPageParam && (isNaN(perPage) || perPage < 1)) {
						throw new ApiError("perPage must be a positive number", 400, "validation");
					}

					return await busApi.getSchedule(undefined, page, perPage);
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "POST",
			path: "/bus/confirm",
			handler: async (body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const { data } = body as { data?: string };
					if (!data) {
						throw new ApiError("Confirmation data is required", 400, "validation");
					}

					const response = await busApi.confirmReservation(data, undefined);
					return { success: true, data: response.data };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "POST",
			path: "/bus/unconfirm",
			handler: async (body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const { data, oneClick } = body as { data?: string; oneClick?: boolean };
					if (!data) {
						throw new ApiError("Unconfirm data (scheduleId:||:date) is required", 400, "validation");
					}

					const response = await busApi.unconfirmReservation(data, undefined, oneClick);
					return { success: true, data: response.data };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "POST",
			path: "/bus/delete",
			handler: async (body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const { reservationId } = body as { reservationId?: string | number };
					if (!reservationId) {
						throw new ApiError("Reservation ID is required", 400, "validation");
					}

					const response = await busApi.deleteReservation(reservationId);
					return { success: true, data: response.data };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "POST",
			path: "/bus/cancel",
			handler: async (body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const { reservationId } = body as { reservationId?: string | number };
					if (!reservationId) {
						throw new ApiError("Reservation ID is required", 400, "validation");
					}

					const response = await busApi.cancelReservation(reservationId);
					return { success: true, data: response.data };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "POST",
			path: "/bus/book",
			handler: async (body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						throw new ApiError("Authentication required. Please login first", 401, "auth");
					}

					await ensureValidSession(auth.username);

					const { scheduleId, scheduleDate, destinationType, oneClick } = body as {
						scheduleId?: number;
						scheduleDate?: string;
						destinationType?: 1 | 2;
						oneClick?: boolean;
					};
					if (!scheduleId || !scheduleDate || !destinationType) {
						throw new ApiError("scheduleId, scheduleDate, and destinationType are required", 400, "validation");
					}

					const response = await busApi.bookBus(scheduleId, scheduleDate, destinationType, undefined, oneClick);
					return { success: true, bookingId: response.data };
				} catch (error) {
					handleApiError(error);
				}
			},
			requiresAuth: true,
		},
		{
			method: "GET",
			path: "/bus/validate",
			handler: async (_body, _query, headers) => {
				try {
					const auth = authenticateRequest(headers || {});
					if (!auth) {
						return { valid: false, message: "No valid authentication token" };
					}

					try {
						const isValid = await busApi.validateSession();
						if (isValid) {
							const storedSession = storage.getSession(auth.username);
							if (storedSession) {
								storedSession.lastValidated = Date.now();
								storage.setSession(auth.username, storedSession);
							}
						}
						return { valid: isValid };
					} catch {
						return { valid: false, message: "Session expired. Please login again" };
					}
				} catch (error) {
					return { valid: false, error: error instanceof Error ? error.message : "Validation failed" };
				}
			},
			requiresAuth: false,
		},
		{
			method: "GET",
			path: "/bus/ticket/qrcode",
			handler: async (_body, query) => {
				try {
					const ticketId = query?.get("ticketId");
					if (!ticketId) {
						throw new ApiError("ticketId parameter is required", 400, "validation");
					}

					const showticketUrl = `/users/schedule/showticket/${ticketId}`;
					const response = await busApi.getTicketQRCodeImage(showticketUrl);
					return response.data;
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "GET",
			path: "/bus/ticket/info",
			handler: async (_body, query) => {
				try {
					const ticketId = query?.get("ticketId");
					if (!ticketId) {
						throw new ApiError("ticketId parameter is required", 400, "validation");
					}

					const showticketUrl = `/users/schedule/showticket/${ticketId}`;
					const ticketInfo = await busApi.getTicketInfo(showticketUrl);
					return ticketInfo;
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "POST",
			path: "/reg/login",
			handler: async (body) => {
				try {
					const { username, password } = body as { username?: string; password?: string };
					if (!username || !password) {
						throw new ApiError("Username and password are required", 400, "validation");
					}
					await regApi.login({ username, password });
					return { success: true, message: "Logged in successfully" };
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "GET",
			path: "/reg/student",
			handler: async () => {
				try {
					return await regApi.getStudentInfo();
				} catch (error) {
					handleApiError(error);
				}
			},
		},
		{
			method: "GET",
			path: "/reg/timetable",
			handler: async () => {
				try {
					return await regApi.getTimeTable();
				} catch (error) {
					handleApiError(error);
				}
			},
		},
	];
}

export function printEndpoints(baseURL: string) {
	console.log("\nAvailable endpoints:");
	console.log("  System:");
	console.log(`    GET    ${baseURL}/health`);
	console.log("  Bus API:");
	console.log(`    POST   ${baseURL}/bus/login`);
	console.log(`    POST   ${baseURL}/bus/login-with`);
	console.log(`    GET    ${baseURL}/bus/available`);
	console.log(`    GET    ${baseURL}/bus/schedule?page={number}&perPage={number}`);
	console.log(`    POST   ${baseURL}/bus/confirm`);
	console.log(`    POST   ${baseURL}/bus/unconfirm`);
	console.log(`    POST   ${baseURL}/bus/delete`);
	console.log(`    POST   ${baseURL}/bus/cancel`);
	console.log(`    POST   ${baseURL}/bus/book`);
	console.log(`    GET    ${baseURL}/bus/validate`);
	console.log(`    GET    ${baseURL}/bus/ticket/qrcode?ticketId={number}`);
	console.log(`    GET    ${baseURL}/bus/ticket/info?ticketId={number}`);
	console.log("  Reg API:");
	console.log(`    POST   ${baseURL}/reg/login`);
	console.log(`    GET    ${baseURL}/reg/student`);
	console.log(`    GET    ${baseURL}/reg/timetable`);
	console.log(`\n`);
}
