import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { ApiServer } from "../config/servers";
import { setupInterceptors } from "./interceptors";
import { CmruBusApiClient } from "./bus.api";
import { RegApiClient } from "./reg.api";
import type { ApiClientConfig, GetApiMethods } from "./types";

export class ApiClient<T extends ApiServer = ApiServer.BUS> {
	private client: AxiosInstance;
	private serverType: T;
	private apiInstance: GetApiMethods<T> | null = null;

	constructor(serverType: T, config?: Omit<ApiClientConfig, "server">) {
		this.serverType = serverType;
		this.client = axios.create({
			baseURL: serverType,
			timeout: config?.timeout,
			headers: {
				"Content-Type": "application/json",
				...config?.headers,
			},
			auth: config?.auth,
			maxRedirects: 5,
			validateStatus: (status) => status < 500,
		});

		setupInterceptors(this.client);
	}

	async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.client.get<T>(url, config);
	}

	async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.client.post<T>(url, data, config);
	}

	async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.client.put<T>(url, data, config);
	}

	async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.client.patch<T>(url, data, config);
	}

	async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.client.delete<T>(url, config);
	}

	api(): GetApiMethods<T> {
		if (this.apiInstance) {
			return this.apiInstance;
		}

		if (this.serverType === ApiServer.BUS) {
			const cmruBusApi = new CmruBusApiClient(this.client);
			this.apiInstance = cmruBusApi as unknown as GetApiMethods<T>;
		} else if (this.serverType === ApiServer.REG) {
			const regApi = new RegApiClient(this.client);
			this.apiInstance = regApi as unknown as GetApiMethods<T>;
		} else {
			throw new Error(`Unknown server type: ${this.serverType}`);
		}

		return this.apiInstance;
	}

	getClient(): AxiosInstance {
		return this.client;
	}
}
