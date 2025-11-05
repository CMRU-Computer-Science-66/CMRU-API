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

export function createRoutes(busApi: BusApi, regApi: RegApi): RouteConfig[] {
	return [
		{
			method: "POST",
			path: "/bus/login",
			handler: async (body) => {
				const { username, password } = body as { username?: string; password?: string };
				if (!username || !password) {
					throw new Error("Username and password are required");
				}
				await busApi.login({ username, password });
				return { success: true, message: "Logged in successfully" };
			},
		},
		{
			method: "GET",
			path: "/bus/available",
			handler: async () => {
				return await busApi.getAvailableBuses();
			},
		},
		{
			method: "GET",
			path: "/bus/schedule",
			handler: async () => {
				return await busApi.getSchedule();
			},
		},
		{
			method: "POST",
			path: "/bus/confirm",
			handler: async (body) => {
				const { data } = body as { data?: string };
				if (!data) {
					throw new Error("Confirmation data is required");
				}
				const response = await busApi.confirmReservation(data);
				return { success: true, data: response.data };
			},
		},
		{
			method: "POST",
			path: "/bus/cancel",
			handler: async (body) => {
				const { data } = body as { data?: string };
				if (!data) {
					throw new Error("Cancellation data is required");
				}
				const response = await busApi.cancelReservation(data);
				return { success: true, data: response.data };
			},
		},
		{
			method: "POST",
			path: "/bus/book",
			handler: async (body) => {
				const { scheduleId, scheduleDate, destinationType } = body as {
					scheduleId?: number;
					scheduleDate?: string;
					destinationType?: 1 | 2;
				};
				if (!scheduleId || !scheduleDate || !destinationType) {
					throw new Error("scheduleId, scheduleDate, and destinationType are required");
				}
				const response = await busApi.bookBus(scheduleId, scheduleDate, destinationType);
				return { success: true, bookingId: response.data };
			},
		},
		{
			method: "GET",
			path: "/bus/validate",
			handler: async () => {
				const isValid = await busApi.validateSession();
				return { valid: isValid };
			},
		},
		{
			method: "POST",
			path: "/reg/login",
			handler: async (body) => {
				const { username, password } = body as { username?: string; password?: string };
				if (!username || !password) {
					throw new Error("Username and password are required");
				}
				await regApi.login({ username, password });
				return { success: true, message: "Logged in successfully" };
			},
		},
		{
			method: "GET",
			path: "/reg/student",
			handler: async () => {
				return await regApi.getStudentInfo();
			},
		},
		{
			method: "GET",
			path: "/reg/timetable",
			handler: async () => {
				return await regApi.getTimeTable();
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
