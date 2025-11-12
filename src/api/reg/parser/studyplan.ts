import * as cheerio from "cheerio";
import type { PaginationInfo, PaginatedResult } from "../../common/pagination";

type PaginatedStudyPlanResult = PaginatedResult<StudyPlanData>;

export interface StudyPlanCourse {
	courseCode: string;
	courseName: string;
	credits: number;
	prerequisite?: string[];
	corequisite?: string[];
	year: number;
	semester: number;
	category: "วิชา" | "วิชาเฉพาะ" | "วิชาเลือก" | "วิชาศึกษาทั่วไป" | "other";
	isCompleted?: boolean;
	grade?: string;
}

export interface StudyPlanCategory {
	categoryName: string;
	requiredCredits: number;
	completedCredits: number;
	courses: StudyPlanCourse[];
}

export interface StudyPlanData {
	studentId?: string;
	studentName?: string;
	program?: string;
	curriculum?: string;
	academicYear?: string;
	totalRequiredCredits: number;
	totalCompletedCredits: number;
	categories: StudyPlanCategory[];
	remainingCourses: StudyPlanCourse[];
}

export function parseStudyPlanHTML(html: string): StudyPlanData {
	const $ = cheerio.load(html, {
		xml: {
			xmlMode: false,
		},
	});

	const result: StudyPlanData = {
		totalRequiredCredits: 0,
		totalCompletedCredits: 0,
		categories: [],
		remainingCourses: [],
	};

	const usernameText = $("table.username td").text();
	const studentMatch = usernameText.match(/(\d{8})\s*:\s*(.+)/);
	if (studentMatch?.[1] && studentMatch[2]) {
		result.studentId = studentMatch[1].trim();
		result.studentName = studentMatch[2].trim();
	}

	const pageText = $("body").text();
	const programMatch = pageText.match(/หลักสูตร[:\s]*(.+?)(?:\n|$)/);
	if (programMatch?.[1]) {
		result.program = programMatch[1].trim();
	}

	const curriculumMatch = pageText.match(/หลักสูตรปี[:\s]*(\d{4})/);
	if (curriculumMatch?.[1]) {
		result.curriculum = curriculumMatch[1];
	}

	$("table").each((_tableIndex, table) => {
		const $table = $(table);
		const headerRow = $table.find("tr").first();
		const headerText = headerRow.text();

		if (!headerText.includes("รหัสวิชา") || !headerText.includes("ชื่อวิชา")) {
			return;
		}

		let currentCategory = "other";
		let categoryRequiredCredits = 0;
		let categoryCompletedCredits = 0;
		const categoryCourses: StudyPlanCourse[] = [];

		$table.find("tr").each((_rowIndex, row) => {
			const $row = $(row);
			const cells = $row.find("td");

			const rowText = $row.text().trim();
			if (rowText.includes("วิชา") || rowText.includes("วิชาเฉพาะ") || rowText.includes("วิชาเลือก") || rowText.includes("วิชาศึกษาทั่วไป")) {
				if (rowText.includes("วิชา")) currentCategory = "วิชา";
				else if (rowText.includes("วิชาเฉพาะ")) currentCategory = "วิชาเฉพาะ";
				else if (rowText.includes("วิชาเลือก")) currentCategory = "วิชาเลือก";
				else if (rowText.includes("วิชาศึกษาทั่วไป")) currentCategory = "วิชาศึกษาทั่วไป";

				const creditsMatch = rowText.match(/(\d+)\s*หน่วยกิต/);
				if (creditsMatch?.[1]) {
					categoryRequiredCredits = parseInt(creditsMatch[1]);
				}
				return;
			}

			if (cells.length < 4) return;

			const courseCodeText = $(cells[0]).text().trim();
			const courseNameText = $(cells[1]).text().trim();
			const creditsText = $(cells[2]).text().trim();
			const yearSemesterText = $(cells[3]).text().trim();

			if (courseCodeText.includes("รหัส") || !courseCodeText || !courseNameText) {
				return;
			}

			const credits = parseInt(creditsText) || 0;

			let year = 1;
			let semester = 1;
			const yearSemesterMatch = yearSemesterText.match(/(\d+)\/(\d+)/);
			if (yearSemesterMatch?.[1] && yearSemesterMatch[2]) {
				year = parseInt(yearSemesterMatch[1]);
				semester = parseInt(yearSemesterMatch[2]);
			}

			let isCompleted = false;
			let grade: string | undefined;
			const gradeCell = $(cells[4]);
			if (gradeCell.length > 0) {
				const gradeText = gradeCell.text().trim();
				if (gradeText && gradeText !== "-") {
					grade = gradeText;
					isCompleted = !["F", "I", "W"].includes(gradeText);
					if (isCompleted) {
						categoryCompletedCredits += credits;
					}
				}
			}

			let prerequisite: string[] | undefined;
			const prereqCell = $(cells[5]);
			if (prereqCell.length > 0) {
				const prereqText = prereqCell.text().trim();
				if (prereqText && prereqText !== "-") {
					prerequisite = prereqText.split(",").map((p) => p.trim());
				}
			}

			const course: StudyPlanCourse = {
				courseCode: courseCodeText,
				courseName: courseNameText,
				credits,
				year,
				semester,
				category: currentCategory as StudyPlanCourse["category"],
				isCompleted,
				grade,
				prerequisite,
			};

			categoryCourses.push(course);

			if (!isCompleted) {
				result.remainingCourses.push(course);
			}
		});

		if (categoryCourses.length > 0) {
			result.categories.push({
				categoryName: currentCategory,
				requiredCredits: categoryRequiredCredits,
				completedCredits: categoryCompletedCredits,
				courses: categoryCourses,
			});

			result.totalRequiredCredits += categoryRequiredCredits;
			result.totalCompletedCredits += categoryCompletedCredits;
		}
	});

	return result;
}

export function parseStudyPlanHTMLWithPagination(html: string): PaginatedStudyPlanResult {
	const studyPlanData = parseStudyPlanHTML(html);
	const $ = cheerio.load(html);
	const pagination: PaginationInfo = {
		currentPage: 1,
		totalPages: 1,
		hasNextPage: false,
		hasPreviousPage: false,
	};

	const yearSections = $("table").filter((_index, table) => {
		const $table = $(table);
		const tableText = $table.text();
		return tableText.includes("ปี") && (tableText.includes("เทอม") || tableText.includes("ภาค"));
	});

	if (yearSections.length > 1) {
		pagination.totalPages = yearSections.length;
	}

	$("tr, td, th").each((_index, element) => {
		const $elem = $(element);
		const text = $elem.text().trim();

		if (text.includes("ปีที่") || text.includes("ชั้นปีที่")) {
			const yearMatch = text.match(/ปี(?:ที่)?\s*(\d+)/);
			if (yearMatch?.[1]) {
				const year = parseInt(yearMatch[1]);
				if ($elem.hasClass("active") || $elem.hasClass("current") || $elem.css("background-color") !== "transparent") {
					pagination.currentPage = year;
				}
				if (year > pagination.totalPages) {
					pagination.totalPages = year;
				}
			}
		}
	});

	pagination.totalItems = studyPlanData.categories.reduce((total, cat) => total + cat.courses.length, 0);
	pagination.itemsPerPage = pagination.totalItems;

	pagination.hasNextPage = pagination.currentPage < pagination.totalPages;
	pagination.hasPreviousPage = pagination.currentPage > 1;

	return {
		data: studyPlanData,
		pagination,
		isComplete: pagination.totalPages <= 1,
	};
}
