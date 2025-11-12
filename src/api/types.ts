import type { ApiServer } from "../config/servers";
import type { Bus } from "./bus.api";
import type { Reg } from "./reg.api";

export interface ApiClientConfig {
	server?: ApiServer | string;
	timeout?: number;
	headers?: Record<string, string>;
	auth?: {
		username: string;
		password: string;
	};
}

export type BusApi = Bus;
export type RegApi = Reg;

export type ApiMethodsMap = {
	[ApiServer.BUS]: BusApi;
	[ApiServer.REG]: RegApi;
};

export type GetApiMethods<T extends ApiServer> = T extends keyof ApiMethodsMap ? ApiMethodsMap[T] : never;
