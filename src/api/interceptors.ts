import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from "axios";

export function setupRequestInterceptor(client: AxiosInstance): void {
	client.interceptors.request.use(
		(config: InternalAxiosRequestConfig) => {
			return config;
		},
		(error: AxiosError) => {
			return Promise.reject(error);
		},
	);
}

export function setupResponseInterceptor(client: AxiosInstance): void {
	client.interceptors.response.use(
		(response: AxiosResponse) => {
			return response;
		},
		(error: AxiosError) => {
			return Promise.reject(error);
		},
	);
}

export function setupInterceptors(client: AxiosInstance): void {
	setupRequestInterceptor(client);
	setupResponseInterceptor(client);
}
