import type { ApiServer } from "../config/servers";
import type { CmruBusApiClient } from "./bus.api";
import type { RegApiClient } from "./reg.api";

export interface ApiClientConfig {
	server?: ApiServer | string;
	timeout?: number;
	headers?: Record<string, string>;
	auth?: {
		username: string;
		password: string;
	};
}

export type BusApi = CmruBusApiClient;
export type RegApi = RegApiClient;

export type ApiMethodsMap = {
	[ApiServer.BUS]: BusApi;
	[ApiServer.REG]: RegApi;
};

export type GetApiMethods<T extends ApiServer> = T extends keyof ApiMethodsMap ? ApiMethodsMap[T] : never;
