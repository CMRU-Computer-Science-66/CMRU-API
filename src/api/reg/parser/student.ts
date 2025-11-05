import * as cheerio from "cheerio";

export interface StudentInfo {
	studentId: string;
	fullName: string;
	thaiName: string;
	englishName?: string;
	faculty?: string;
	major?: string;
	department?: string;
	year?: string;
	status?: string;
	advisorName?: string;
	hasOutstandingPayment?: boolean;
}

export function parseStudentInfo(html: string): StudentInfo {
	const $ = cheerio.load(html, {
		xml: {
			xmlMode: false,
		},
	});

	const result: StudentInfo = {
		studentId: "",
		fullName: "",
		thaiName: "",
	};

	const $usernameTable = $("table.username");
	const $usernameTd = $usernameTable.find("td").eq(1);
	const usernameFullText = $usernameTd.text().trim();

	const parts = usernameFullText.split(" : ");
	if (parts.length >= 2 && parts[0] && parts[1]) {
		result.studentId = parts[0].trim();
		result.fullName = parts[1].trim();
		result.thaiName = parts[1].trim();
	} else if (usernameFullText) {
		result.fullName = usernameFullText;
		result.thaiName = usernameFullText;
	}

	$("tr").each((_index, row) => {
		const $row = $(row);
		const $headerCell = $row.find("td.headerdetail, font.headerdetail").first();
		const $dataCell = $row.find("td.normaldetail, font.normaldetail").first();
		const headerText = $headerCell.text().trim();
		const dataText = $dataCell.text().trim();

		if (headerText && dataText) {
			if (headerText.includes("สถานภาพ") || headerText.toLowerCase().includes("status")) {
				result.status = dataText;
			} else if (headerText.includes("คณะ") || headerText.toLowerCase().includes("faculty")) {
				result.faculty = dataText;
			} else if (headerText.includes("ภาควิชา") || headerText.toLowerCase().includes("department")) {
				result.department = dataText;
			} else if (headerText.includes("สาขาวิชา") || headerText.toLowerCase().includes("major")) {
				result.major = dataText;
			} else if (headerText.includes("อ. ที่ปรึกษา") || headerText.includes("อาจารย์ที่ปรึกษา") || headerText.toLowerCase().includes("advisor")) {
				result.advisorName = dataText;
			}
		}
	});

	const bodyText = $("body").text();
	result.hasOutstandingPayment = bodyText.includes("มียอดเงินค้างชำระ") || bodyText.toLowerCase().includes("outstanding");

	return result;
}
