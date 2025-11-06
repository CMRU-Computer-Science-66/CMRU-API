import type { BusApi, RegApi } from "../api/types";

export const API_ENDPOINTS = {
	bus: {
		login: "POST /bus/login",
		availableBuses: "GET /bus/available",
		schedule: "GET /bus/schedule",
		confirmReservation: "POST /bus/confirm",
		cancelReservation: "POST /bus/cancel",
		bookBus: "POST /bus/book",
		validateSession: "GET /bus/validate",
	},
	reg: {
		login: "POST /reg/login",
		studentInfo: "GET /reg/student",
		timetable: "GET /reg/timetable",
	},
} as const;

export type EndpointHandler = (body?: unknown) => Promise<unknown>;

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
		const message = error.message.toLowerCase();

		if (message.includes("invalid username or password") || message.includes("login failed")) {
			throw new ApiError("Invalid username or password", 401, "auth");
		}

		if (message.includes("session expired") || message.includes("please login again")) {
			throw new ApiError("Session expired. Please login again", 401, "session");
		}

		if (message.includes("no authentication cookies") || message.includes("no credentials available")) {
			throw new ApiError("Authentication required. Please login first", 401, "auth");
		}

		if (message.includes("timeout") || message.includes("network") || message.includes("econnrefused")) {
			throw new ApiError("Network error. Please try again", 503, "network");
		}

		if (message.includes("unexpected response status") || message.includes("failed to")) {
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
			handler: async () => {
				try {
					return await busApi.getSchedule();
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
					const response = await busApi.confirmReservation(data);
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
					const { data } = body as { data?: string };
					if (!data) {
						throw new ApiError("Cancellation data is required", 400, "validation");
					}
					const response = await busApi.cancelReservation(data);
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
					const { scheduleId, scheduleDate, destinationType } = body as {
						scheduleId?: number;
						scheduleDate?: string;
						destinationType?: 1 | 2;
					};
					if (!scheduleId || !scheduleDate || !destinationType) {
						throw new ApiError("scheduleId, scheduleDate, and destinationType are required", 400, "validation");
					}
					const response = await busApi.bookBus(scheduleId, scheduleDate, destinationType);
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
	console.log(`    GET    ${baseURL}/bus/available`);
	console.log(`    GET    ${baseURL}/bus/schedule`);
	console.log(`    POST   ${baseURL}/bus/confirm`);
	console.log(`    POST   ${baseURL}/bus/cancel`);
	console.log(`    POST   ${baseURL}/bus/book`);
	console.log(`    GET    ${baseURL}/bus/validate`);
	console.log("  Reg API:");
	console.log(`    POST   ${baseURL}/reg/login`);
	console.log(`    GET    ${baseURL}/reg/student`);
	console.log(`    GET    ${baseURL}/reg/timetable`);
	console.log(`\n`);
}
