import type { AxiosInstance, AxiosResponse } from "axios";
import type { RegApi } from "./types";
import type { SessionCredentials, SessionResponse } from "../types/session";
import { SessionManager } from "./manager/session-manager";
import { parseTimetable, type TimetableData } from "./reg/parser/timetable";
import { parseStudentInfo, type StudentInfo } from "./reg/parser/student";
import { parseGradeHTML, parseGradeHTMLWithPagination, type GradeData } from "./reg/parser/grade";
import { parseActivityHTML, parseActivityHTMLWithPagination, type ActivityData } from "./reg/parser/activity";
import { parseStudyPlanHTML, parseStudyPlanHTMLWithPagination, type StudyPlanData } from "./reg/parser/studyplan";
import { generateRandomUserAgent } from "./utilities/user-agent";
import { parseSetCookieHeader, formatCookies } from "./manager/cookie-manager";

/**
 * คลาสสำหรับเรียกใช้ API ของระบบทะเบียนนักศึกษา CMRU
 * ใช้สำหรับดึงข้อมูลนักศึกษา ตารางเรียน เกรด กิจกรรม และแผนการศึกษา
 *
 * @example
 * ```typescript
 * import { ApiClient, ApiServer } from '@cmru-comsci-66/cmru-api';
 *
 * const client = new ApiClient(ApiServer.REG);
 * const regApi = client.api();
 *
 * // เข้าสู่ระบบ
 * await regApi.login({
 *   username: '66143000',
 *   password: 'yourpassword'
 * });
 *
 * // ดึงข้อมูลนักศึกษา
 * const studentInfo = await regApi.getStudentInfo();
 * console.log(studentInfo);
 * // Output: { studentId: '66143000', fullName: 'นายจอห์น โด', ... }
 * ```
 */
export class Reg implements RegApi {
	private sessionManager: SessionManager;

	constructor(
		private client: AxiosInstance,
		sessionKey: string = "reg",
	) {
		this.sessionManager = SessionManager.forRegApi(sessionKey);
	}

	public getSessionManager(): SessionManager {
		return this.sessionManager;
	}

	private async getBuildKeyAndCookies(): Promise<{ buildKey: string | null; initialCookies: string[] | null }> {
		try {
			const response = await this.client.get("/registrar/login.asp", {
				responseType: "arraybuffer",
				maxRedirects: 0,
				validateStatus: (status) => status >= 200 && status < 400,
			});

			const decoder = new TextDecoder("windows-874");
			const html = decoder.decode(response.data);
			const buildKeyMatch = html.match(/NAME=BUILDKEY\s+value=(\d+)/i);
			const buildKey = buildKeyMatch?.[1] ?? null;
			const initialCookies = parseSetCookieHeader(response);

			return { buildKey, initialCookies };
		} catch (error) {
			console.error("Failed to get BUILDKEY and cookies:", error);
			return { buildKey: null, initialCookies: null };
		}
	}

	private async getBuildKey(): Promise<string | null> {
		const { buildKey } = await this.getBuildKeyAndCookies();
		return buildKey;
	}

	/**
	 * เข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่าน
	 *
	 * @example
	 * ```typescript
	 * const result = await regApi.login({
	 *   username: '66143000',
	 *   password: 'yourpassword'
	 * });
	 * // ระบบจะเก็บ session อัตโนมัติสำหรับการเรียกใช้ API ครั้งถัดไป
	 * ```
	 */
	/**
	 * เข้าสู่ระบบทะเบียนนักศึกษา CMRU
	 *
	 * @example
	 * ```typescript
	 * await regApi.login({
	 *   username: '66143000',
	 *   password: 'yourpassword'
	 * });
	 * ```
	 */
	public async login(credentials: SessionCredentials, buildKey?: string): Promise<AxiosResponse<SessionResponse>> {
		const { buildKey: fetchedBuildKey, initialCookies } = await this.getBuildKeyAndCookies();

		const finalBuildKey = buildKey || fetchedBuildKey || undefined;

		const formData = new URLSearchParams();
		formData.append("f_uid", credentials.username);
		formData.append("f_pwd", credentials.password);

		if (finalBuildKey) {
			formData.append("BUILDKEY", finalBuildKey);
		}

		const headers: Record<string, string> = {
			"User-Agent": generateRandomUserAgent(),
			"Content-Type": "application/x-www-form-urlencoded",
			"Upgrade-Insecure-Requests": "1",
		};

		if (initialCookies) {
			const cookieString = formatCookies(initialCookies);
			headers.Cookie = cookieString;
		}

		const response = await this.client.post("/registrar/validate.asp", formData, {
			headers,
			responseType: "arraybuffer",
		});

		const decoder = new TextDecoder("windows-874");
		response.data = decoder.decode(response.data);

		const sessionCookies = parseSetCookieHeader(response);

		let finalCookies: string[];
		if (sessionCookies && sessionCookies.length > 0) {
			finalCookies = sessionCookies;
		} else if (initialCookies) {
			finalCookies = initialCookies;
		} else {
			throw new Error("Failed to obtain session cookies from login");
		}

		this.sessionManager.setSession(credentials.username, credentials.password, finalCookies);

		return response as AxiosResponse<SessionResponse>;
	}

	/**
	 * ดึงตารางเรียน
	 *
	 * @example
	 * ```typescript
	 * const timetable = await regApi.getTimeTable();
	 * console.log(timetable);
	 * // Output: {
	 * //   schedule: [
	 * //     {
	 * //       day: 'จันทร์',
	 * //       time: '08:00-10:00',
	 * //       courseCode: 'COM 2305-63',
	 * //       courseName: 'การเขียนโปรแกรมเว็บ',
	 * //       room: 'SCI9-306'
	 * //     }
	 * //   ]
	 * // }
	 * ```
	 */
	public async getTimeTable(): Promise<TimetableData> {
		const response = await this.getTimeTableRaw();
		return parseTimetable(response.data);
	}

	public async getTimeTableRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);
		const response = await this.client.get("/registrar/time_table.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	/**
	 * ดึงข้อมูลนักศึกษา
	 *
	 * @example
	 * ```typescript
	 * const studentInfo = await regApi.getStudentInfo();
	 * console.log(studentInfo);
	 * // Output: {
	 * //   studentId: '66143000',
	 * //   fullName: 'นายจอห์น โด',
	 * //   thaiName: 'นายจอห์น โด',
	 * //   hasOutstandingPayment: false
	 * // }
	 * ```
	 */
	public async getStudentInfo(): Promise<StudentInfo> {
		const response = await this.getStudentInfoRaw();
		return parseStudentInfo(response.data);
	}

	public async getStudentInfoRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);

		const response = await this.client.get("/registrar/student.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data && response.data.byteLength > 0) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	/**
	 * ดึงข้อมูลเกรด
	 *
	 * @example
	 * ```typescript
	 * const grades = await regApi.getGrades();
	 * console.log(grades);
	 * // Output: {
	 * //   records: [
	 * //     {
	 * //       courseCode: 'COM 2305-63',
	 * //       courseName: 'การเขียนโปรแกรมเว็บ',
	 * //       credits: 3,
	 * //       grade: 'A',
	 * //       gradePoints: 4.0
	 * //     }
	 * //   ],
	 * //   summary: { totalCredits: 120, gpa: 3.75 }
	 * // }
	 * ```
	 */
	public async getGrades(): Promise<GradeData> {
		const response = await this.getGradesRaw();
		return parseGradeHTML(response.data);
	}

	public async getGradesRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);
		const response = await this.client.get("/registrar/grade.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	/**
	 * ดึงข้อมูลกิจกรรมนักศึกษา
	 *
	 * @example
	 * ```typescript
	 * const activities = await regApi.getActivity();
	 * console.log(activities);
	 * // Output: {
	 * //   records: [
	 * //     {
	 * //       activityName: 'กิจกรรมวันแรกเข้าเรียน',
	 * //       date: '2024-08-15',
	 * //       status: 'ผ่าน',
	 * //       hours: 8
	 * //     }
	 * //   ],
	 * //   summary: { totalHours: 120, requiredHours: 180 }
	 * // }
	 * ```
	 */
	public async getActivity(): Promise<ActivityData> {
		const response = await this.getActivityRaw();
		return parseActivityHTML(response.data);
	}

	public async getActivityRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);
		const response = await this.client.get("/registrar/studentactivitycheck.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	/**
	 * ดึงแผนการศึกษา
	 *
	 * @example
	 * ```typescript
	 * const studyPlan = await regApi.getStudyPlan();
	 * console.log(studyPlan);
	 * // Output: {
	 * //   categories: [
	 * //     {
	 * //       name: 'วิชา',
	 * //       totalCredits: 18,
	 * //       courses: [
	 * //         {
	 * //           courseCode: 'COM 2305-63',
	 * //           courseName: 'การเขียนโปรแกรมเว็บ',
	 * //           credits: 3,
	 * //           year: 1,
	 * //           semester: 1
	 * //         }
	 * //       ]
	 * //     }
	 * //   ]
	 * // }
	 * ```
	 */
	public async getStudyPlan(): Promise<StudyPlanData> {
		const response = await this.getStudyPlanRaw();
		return parseStudyPlanHTML(response.data);
	}

	public async getStudyPlanRaw(): Promise<AxiosResponse<string>> {
		const cookies = this.sessionManager.getCookies();

		if (!cookies) {
			throw new Error("Not logged in. Please call login() first.");
		}

		const cookieHeader = formatCookies(cookies);
		const response = await this.client.get("/registrar/Student_Studyplan.asp", {
			headers: {
				Cookie: cookieHeader,
			},
			responseType: "arraybuffer",
		});

		if (response.data) {
			const decoder = new TextDecoder("windows-874");
			response.data = decoder.decode(response.data);
		}

		return response as AxiosResponse<string>;
	}

	/**
	 * ดึงข้อมูลเกรดแบบมี Pagination
	 *
	 * @example
	 * ```typescript
	 * const gradesWithPagination = await regApi.getGradesWithPagination();
	 * console.log(gradesWithPagination);
	 * // Output: {
	 * //   data: { records: [...], summary: {...} },
	 * //   pagination: { currentPage: 1, totalPages: 3, hasNextPage: true },
	 * //   isComplete: false
	 * // }
	 * ```
	 */
	public async getGradesWithPagination() {
		const response = await this.getGradesRaw();
		return parseGradeHTMLWithPagination(response.data);
	}

	/**
	 * ดึงข้อมูลกิจกรรมแบบมี Pagination
	 *
	 * @example
	 * ```typescript
	 * const activitiesWithPagination = await regApi.getActivityWithPagination();
	 * console.log(activitiesWithPagination);
	 * // Output: {
	 * //   data: { records: [...], summary: {...} },
	 * //   pagination: { currentPage: 1, totalPages: 2, hasNextPage: true },
	 * //   isComplete: false
	 * // }
	 * ```
	 */
	public async getActivityWithPagination() {
		const response = await this.getActivityRaw();
		return parseActivityHTMLWithPagination(response.data);
	}

	/**
	 * ดึงแผนการศึกษาแบบมี Pagination
	 *
	 * @example
	 * ```typescript
	 * const studyPlanWithPagination = await regApi.getStudyPlanWithPagination();
	 * console.log(studyPlanWithPagination);
	 * // Output: {
	 * //   data: { categories: [...] },
	 * //   pagination: { currentPage: 1, totalPages: 4, hasNextPage: true },
	 * //   isComplete: false
	 * // }
	 * ```
	 */
	public async getStudyPlanWithPagination() {
		const response = await this.getStudyPlanRaw();
		return parseStudyPlanHTMLWithPagination(response.data);
	}

	/**
	 * ดึงข้อมูลเกรดทั้งหมด (รวมทุกหน้า)
	 *
	 * @example
	 * ```typescript
	 * const completeGrades = await regApi.getCompleteGrades();
	 * console.log(completeGrades);
	 * // Output: { records: [...ทุกเทอม...], summary: { gpa: 3.75 } }
	 * ```
	 */
	public async getCompleteGrades(): Promise<GradeData> {
		const paginatedResult = await this.getGradesWithPagination();

		if (paginatedResult.isComplete) {
			return paginatedResult.data;
		}

		return paginatedResult.data;
	}

	public async getCompleteActivity(): Promise<ActivityData> {
		const paginatedResult = await this.getActivityWithPagination();

		if (paginatedResult.isComplete) {
			return paginatedResult.data;
		}

		return paginatedResult.data;
	}

	public async getCompleteStudyPlan(): Promise<StudyPlanData> {
		const paginatedResult = await this.getStudyPlanWithPagination();

		if (paginatedResult.isComplete) {
			return paginatedResult.data;
		}

		return paginatedResult.data;
	}

	public clearSession(): void {
		this.sessionManager.clearSession();
	}
}
