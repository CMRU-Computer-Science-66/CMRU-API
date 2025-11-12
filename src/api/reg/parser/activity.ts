import * as cheerio from "cheerio";
import type { PaginationInfo, PaginatedResult } from "../../common/pagination";

type PaginatedActivityResult = PaginatedResult<ActivityData>;

export interface ActivityRecord {
	activityId: string;
	activityName: string;
	activityType?: string;
	date?: string;
	location?: string;
	status?: "ผ่าน" | "ไม่ผ่าน" | "รอผล" | "ลงทะเบียน";
	hours?: number;
	score?: number;
}

export interface ActivitySummary {
	totalActivities: number;
	passedActivities: number;
	totalHours: number;
	requiredHours?: number;
	isCompleted: boolean;
}

export interface ActivityData {
	studentId?: string;
	studentName?: string;
	activities: ActivityRecord[];
	summary: ActivitySummary;
}

export function parseActivityHTML(html: string): ActivityData {
	const $ = cheerio.load(html);
	const result: ActivityData = {
		activities: [],
		summary: {
			totalActivities: 0,
			passedActivities: 0,
			totalHours: 0,
			isCompleted: false,
		},
	};

	const usernameText = $("table.username td").text();
	const studentMatch = usernameText.match(/(\d{8})\s*:\s*(.+)/);
	if (studentMatch?.[1] && studentMatch[2]) {
		result.studentId = studentMatch[1].trim();
		result.studentName = studentMatch[2].trim();
	}

	let totalHours = 0;
	let passedCount = 0;

	$("table").each((_tableIndex, table) => {
		const $table = $(table);
		const headerRow = $table.find("tr").first();
		const headerText = headerRow.text();

		if (!headerText.includes("กิจกรรม") && !headerText.includes("activity")) {
			return;
		}

		$table.find("tr").each((_rowIndex, row) => {
			const $row = $(row);
			const cells = $row.find("td");

			if (cells.length < 3) return;

			const activityIdText = $(cells[0]).text().trim();
			const activityNameText = $(cells[1]).text().trim();
			const statusText = $(cells[2]).text().trim();

			if (activityIdText.includes("รหัส") || !activityIdText || !activityNameText) {
				return;
			}

			let status: ActivityRecord["status"] = "รอผล";
			if (statusText.includes("ผ่าน")) {
				status = "ผ่าน";
				passedCount++;
			} else if (statusText.includes("ไม่ผ่าน")) {
				status = "ไม่ผ่าน";
			} else if (statusText.includes("ลงทะเบียน")) {
				status = "ลงทะเบียน";
			}

			let hours = 0;
			const hoursMatch = $(cells[3])?.text().match(/(\d+)/);
			if (hoursMatch?.[1]) {
				hours = parseInt(hoursMatch[1]);
				totalHours += hours;
			}

			let date: string | undefined;
			const dateText = $(cells[4])?.text().trim();
			if (dateText && dateText !== "-") {
				date = dateText;
			}

			let location: string | undefined;
			const locationText = $(cells[5])?.text().trim();
			if (locationText && locationText !== "-") {
				location = locationText;
			}

			result.activities.push({
				activityId: activityIdText,
				activityName: activityNameText,
				status,
				hours,
				date,
				location,
			});
		});
	});

	result.summary = {
		totalActivities: result.activities.length,
		passedActivities: passedCount,
		totalHours,
		isCompleted: passedCount >= (result.summary.requiredHours || 0),
	};

	const pageText = $("body").text();
	const requiredHoursMatch = pageText.match(/ต้องการ\s*(\d+)\s*ชั่วโมง/);
	if (requiredHoursMatch?.[1]) {
		result.summary.requiredHours = parseInt(requiredHoursMatch[1]);
		result.summary.isCompleted = totalHours >= result.summary.requiredHours;
	}

	return result;
}

export function parseActivityHTMLWithPagination(html: string): PaginatedActivityResult {
	const activityData = parseActivityHTML(html);
	const $ = cheerio.load(html);

	const pagination: PaginationInfo = {
		currentPage: 1,
		totalPages: 1,
		hasNextPage: false,
		hasPreviousPage: false,
	};

	$(".pagination, .pager, .page-nav")
		.find("a, span")
		.each((_index, element) => {
			const text = $(element).text().trim();
			const pageNum = parseInt(text);

			if (!isNaN(pageNum)) {
				if (pageNum > pagination.totalPages) {
					pagination.totalPages = pageNum;
				}
				if ($(element).hasClass("active") || $(element).hasClass("current")) {
					pagination.currentPage = pageNum;
				}
			}
		});

	const bodyText = $("body").text();
	const itemCountMatch = bodyText.match(/จำนวน\s*(\d+)\s*กิจกรรม/i) || bodyText.match(/รวม\s*(\d+)\s*รายการ/i) || bodyText.match(/total\s*(\d+)\s*activities/i);

	if (itemCountMatch?.[1]) {
		pagination.totalItems = parseInt(itemCountMatch[1]);
		pagination.itemsPerPage = 20;
		pagination.totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);
	}

	$("a[onclick*='Setpostform']").each((_index, element) => {
		const onclick = $(element).attr("onclick") || "";
		const pageMatch = onclick.match(/[?&](?:page|p)=(\d+)/i);

		if (pageMatch?.[1]) {
			const pageNum = parseInt(pageMatch[1]);
			if (pageNum > pagination.totalPages) {
				pagination.totalPages = pageNum;
			}
		}
	});

	pagination.hasNextPage = pagination.currentPage < pagination.totalPages;
	pagination.hasPreviousPage = pagination.currentPage > 1;

	return {
		data: activityData,
		pagination,
		isComplete: pagination.totalPages <= 1 || activityData.activities.length === 0,
	};
}
