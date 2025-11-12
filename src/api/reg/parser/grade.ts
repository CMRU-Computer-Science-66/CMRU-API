import * as cheerio from "cheerio";
import type { PaginationInfo, PaginatedResult } from "../../common/pagination";

type PaginatedGradeResult = PaginatedResult<GradeData>;

export interface GradeRecord {
	courseCode: string;
	courseName: string;
	section?: string;
	credits: number;
	grade: string;
	gradePoints?: number;
}

export interface GradeSummary {
	totalCredits: number;
	totalGradePoints: number;
	gpa: number;
}

export interface SemesterGrades {
	academicYear: string;
	semester: string;
	courses: GradeRecord[];
	summary?: GradeSummary;
}

export interface GradeData {
	studentId?: string;
	studentName?: string;
	semesters: SemesterGrades[];
	overallGpa?: number;
	totalCredits?: number;
}

const gradePointMap: Record<string, number> = {
	A: 4.0,
	"B+": 3.5,
	B: 3.0,
	"C+": 2.5,
	C: 2.0,
	"D+": 1.5,
	D: 1.0,
	F: 0.0,
	I: 0.0,
	W: 0.0,
};

function calculateGradePoints(grade: string): number {
	return gradePointMap[grade] ?? 0;
}

export function parseGradeHTML(html: string): GradeData {
	const $ = cheerio.load(html, {
		xml: {
			xmlMode: false,
		},
	});

	const result: GradeData = {
		semesters: [],
	};

	const usernameText = $("table.username td").text();
	const studentMatch = usernameText.match(/(\d{8})\s*:\s*(.+)/);
	if (studentMatch?.[1] && studentMatch[2]) {
		result.studentId = studentMatch[1].trim();
		result.studentName = studentMatch[2].trim();
	}

	$("table").each((_tableIndex, table) => {
		const $table = $(table);
		const $headerRow = $table.find("tr").first();
		const headerText = $headerRow.text();

		if (!headerText.includes("รหัสวิชา") || !headerText.includes("เกรด")) {
			return;
		}

		const courses: GradeRecord[] = [];
		let totalCredits = 0;
		let totalGradePoints = 0;

		$table.find("tr").each((_rowIndex, row) => {
			const $row = $(row);
			const cells = $row.find("td");

			if (cells.length !== 5) return;

			const courseCodeText = $(cells[0]).text().trim();
			const courseNameText = $(cells[1]).text().trim();
			const sectionText = $(cells[2]).text().trim();
			const creditsText = $(cells[3]).text().trim();
			const gradeText = $(cells[4]).text().trim();

			if (courseCodeText.includes("รหัสวิชา") || !courseCodeText || !gradeText) {
				return;
			}

			const credits = parseInt(creditsText) || 0;
			const gradePoints = calculateGradePoints(gradeText);

			courses.push({
				courseCode: courseCodeText,
				courseName: courseNameText,
				section: sectionText || undefined,
				credits,
				grade: gradeText,
				gradePoints,
			});

			if (gradeText !== "W" && gradeText !== "I") {
				totalCredits += credits;
				totalGradePoints += gradePoints * credits;
			}
		});

		if (courses.length > 0) {
			const gpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;

			let academicYear = "unknown";
			let semester = "unknown";
			const bodyHtml = $("body").html() || "";

			const yearParamMatch = bodyHtml.match(/gradeacadyear=\s*(\d{4})/i) || bodyHtml.match(/ACADYEAR=\s*(\d{4})/i) || bodyHtml.match(/ACADYEAR%3D(\d{4})/i);
			const semParamMatch = bodyHtml.match(/gradesemester=\s*(\d)/i) || bodyHtml.match(/gradesemester%3D(\d)/i);

			if (yearParamMatch?.[1]) {
				academicYear = yearParamMatch[1];
			}
			if (semParamMatch?.[1]) {
				semester = semParamMatch[1];
			}

			if (academicYear === "unknown") {
				const yearTextMatch = bodyHtml.match(/ปีการศึกษา\s*(\d{4})/i) || bodyHtml.match(/(\d{4})\s*ปีการศึกษา/i);
				if (yearTextMatch?.[1]) {
					academicYear = yearTextMatch[1];
				}
			}
			if (semester === "unknown") {
				const semTextMatch = bodyHtml.match(/ภาคเรียน(?:ที่)?\s*(\d)/i) || bodyHtml.match(/semester\s*(\d)/i);
				if (semTextMatch?.[1]) {
					semester = semTextMatch[1];
				}
			}

			if (academicYear === "unknown") {
				const looseYear = bodyHtml.match(/(gradeacadyear|ACADYEAR)[^\d]*(\d{4})/i) || bodyHtml.match(/(\d{4})/);
				if (looseYear?.[2]) academicYear = looseYear[2];
				else if (looseYear?.[1] && /^\d{4}$/.test(looseYear[1])) academicYear = looseYear[1];
			}

			result.semesters.push({
				academicYear,
				semester,
				courses,
				summary: {
					totalCredits,
					totalGradePoints,
					gpa: parseFloat(gpa.toFixed(2)),
				},
			});
		}
	});

	let overallCredits = 0;
	let overallGradePoints = 0;

	result.semesters.forEach((semester) => {
		if (semester.summary) {
			overallCredits += semester.summary.totalCredits;
			overallGradePoints += semester.summary.totalGradePoints;
		}
	});

	result.overallGpa = overallCredits > 0 ? parseFloat((overallGradePoints / overallCredits).toFixed(2)) : 0;
	result.totalCredits = overallCredits;

	return result;
}

export function parseGradeHTMLWithPagination(html: string): PaginatedGradeResult {
	const gradeData = parseGradeHTML(html);
	const $ = cheerio.load(html);
	const pagination: PaginationInfo = {
		currentPage: 1,
		totalPages: 1,
		hasNextPage: false,
		hasPreviousPage: false,
	};

	const pageLinks: Array<{ page: number; year: string; semester: string }> = [];

	$("a[onclick*='Setpostform']").each((_index, element) => {
		const onclick = $(element).attr("onclick") || "";
		const text = $(element).text().trim();
		const yearMatch = onclick.match(/gradeacadyear=(\d{4})/);
		const semesterMatch = onclick.match(/gradesemester=(\d+)/);

		if (yearMatch?.[1] && semesterMatch?.[1] && text.includes(yearMatch[1])) {
			const year = yearMatch[1];
			const semester = semesterMatch[1];

			pageLinks.push({
				page: pageLinks.length + 1,
				year,
				semester,
			});
		}
	});

	const bodyHtml = $("body").html() || "";
	const allYearMatches = bodyHtml.match(/(\d{4})/g) || [];
	const uniqueYears = [...new Set(allYearMatches.filter((year) => parseInt(year) >= 2560 && parseInt(year) <= 2570))];

	if (uniqueYears.length > 1) {
		pagination.totalPages = uniqueYears.length * 2;
	}

	if (gradeData.semesters.length > 0) {
		const currentSemester = gradeData.semesters[0];
		if (currentSemester && currentSemester.academicYear !== "unknown") {
			const yearIndex = uniqueYears.indexOf(currentSemester.academicYear);
			if (yearIndex >= 0) {
				const semesterNum = parseInt(currentSemester.semester) || 1;
				pagination.currentPage = yearIndex * 2 + (semesterNum - 1) + 1;
			}
		}
	}

	pagination.hasNextPage = pagination.currentPage < pagination.totalPages;
	pagination.hasPreviousPage = pagination.currentPage > 1;

	return {
		data: gradeData,
		pagination,
		isComplete: gradeData.semesters.length === 0 || pagination.totalPages === 1,
	};
}
