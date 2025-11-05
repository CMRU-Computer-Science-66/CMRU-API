import * as cheerio from "cheerio";

export interface CourseSchedule {
	courseCode: string;
	courseName: string;
	section?: string;
	credits?: string;
	instructor?: string;
	schedule?: string;
	room?: string;
}

export interface TimetableData {
	studentId?: string;
	studentName?: string;
	semester?: string;
	academicYear?: string;
	courses: CourseSchedule[];
}

export function parseTimetable(html: string): TimetableData {
	const $ = cheerio.load(html, {
		xml: {
			xmlMode: false,
		},
	});

	const result: TimetableData = {
		courses: [],
	};

	const usernameText = $("table.username td").text();
	const studentMatch = usernameText.match(/(\d{8})\s*:\s*(.+)/);
	if (studentMatch?.[1] && studentMatch[2]) {
		result.studentId = studentMatch[1].trim();
		result.studentName = studentMatch[2].trim();
	}

	$("select[name=ACADYEAR] option[selected]").each((_index, elem) => {
		result.academicYear = $(elem).val() as string;
	});

	const pageHtml = $("body").html() || "";
	const semesterMatch = pageHtml.match(/<b>(\d+)<\/b>/i);
	if (semesterMatch?.[1]) {
		result.semester = semesterMatch[1];
	}

	let foundCourseTable = false;
	$("table").each((_tableIndex, table) => {
		if (foundCourseTable) return;

		const $table = $(table);
		const $headerRow = $table.find('tr[bgcolor="#F6F6FF"]').first();

		if ($headerRow.length === 0) return;

		const headerCells = $headerRow.find("td");
		if (headerCells.length !== 6) return;

		foundCourseTable = true;

		$table.find("tr").each((_rowIndex, row) => {
			const $row = $(row);

			if ($row.attr("bgcolor") === "#F6F6FF") return;
			if ($row.find("table").length > 0) return;

			const cells = $row.find("td");

			if (cells.length !== 6) return;

			const courseCodeText = $(cells[0]).find("font.normaldetail").text().trim();
			const sectionText = $(cells[1]).find("font.normaldetail").text().trim();
			const nameText = $(cells[2]).find("font.normaldetail").text().trim();
			const creditsText = $(cells[3]).find("font.normaldetail").text().trim();
			const instructorText = $(cells[4]).find("font.normaldetail").text().trim();
			const scheduleText = $(cells[5]).find("font.normaldetail").text().trim();

			if (courseCodeText && /^[A-Z]+\s+\d+-\d+$/.test(courseCodeText)) {
				const roomMatch = scheduleText.match(/([A-Z]+\d+-\d+)/);

				result.courses.push({
					courseCode: courseCodeText,
					section: sectionText || undefined,
					courseName: nameText,
					credits: creditsText || undefined,
					instructor: instructorText || undefined,
					schedule: scheduleText || undefined,
					room: roomMatch?.[1] || undefined,
				});
			}
		});
	});

	return result;
}
