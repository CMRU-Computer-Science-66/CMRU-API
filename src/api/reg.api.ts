import type { AxiosInstance, AxiosResponse } from "axios";
import type { RegApi } from "./types";

export class RegApiClient implements RegApi {
	constructor(private client: AxiosInstance) {}

	public async getStudentInfo<T = unknown>(studentId: string): Promise<AxiosResponse<T>> {
		return this.client.get<T>(`/student/${studentId}`);
	}
}
