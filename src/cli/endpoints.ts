import type { BusApi, RegApi } from "../api/types";
import { UserType } from "../api/bus.api";

export const API_ENDPOINTS = {
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
	},
	reg: {
		login: "POST /reg/login",
		studentInfo: "GET /reg/student",
		timetable: "GET /reg/timetable",
	},
} as const;

export type EndpointHandler = (body?: unknown, query?: URLSearchParams) => Promise<unknown>;

export interface RouteConfig {
	method: "GET" | "POST";
	path: string;
	handler: EndpointHandler;
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

export function createRoutes(busApi: BusApi, regApi: RegApi): RouteConfig[] {
	return [
		{
			method: "POST",
			path: "/bus/login",
			handler: async (body) => {
				try {
					const { username, password } = body as { username?: string; password?: string };
					if (!username || !password) {
						throw new ApiError("Username and password are required", 400, "validation");
					}
					await busApi.login({ username, password });
					return { success: true, message: "Logged in successfully" };
				} catch (error) {
					handleApiError(error);
				}
			},
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
			handler: async (_body, query) => {
				try {
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
		},
		{
			method: "POST",
			path: "/bus/confirm",
			handler: async (body) => {
				try {
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
		},
		{
			method: "POST",
			path: "/bus/unconfirm",
			handler: async (body) => {
				try {
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
		},
		{
			method: "POST",
			path: "/bus/delete",
			handler: async (body) => {
				try {
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
		},
		{
			method: "POST",
			path: "/bus/cancel",
			handler: async (body) => {
				try {
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
		},
		{
			method: "POST",
			path: "/bus/book",
			handler: async (body) => {
				try {
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
		},
		{
			method: "GET",
			path: "/bus/validate",
			handler: async () => {
				try {
					const isValid = await busApi.validateSession();
					return { valid: isValid };
				} catch (error) {
					handleApiError(error);
				}
			},
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
	console.log("  Reg API:");
	console.log(`    POST   ${baseURL}/reg/login`);
	console.log(`    GET    ${baseURL}/reg/student`);
	console.log(`    GET    ${baseURL}/reg/timetable`);
	console.log(`\n`);
}
