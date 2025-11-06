import * as cheerio from "cheerio";

export interface TicketInfo {
	destination: {
		name: string;
		type: "เวียงบัว" | "แม่ริม";
	};
	schedule: {
		day: string;
		date: string;
		time: string;
		fullSchedule: string;
	};
	qrCode: {
		imageUrl: string;
	};
	student: {
		studentId: string;
		name: string;
	};
}

export function parseTicketHTML(html: string): TicketInfo {
	const $ = cheerio.load(html);
	const destinationText = $("h1:contains('ปลายทาง')").find("span.text-info").text().trim();
	const destinationType = destinationText as TicketInfo["destination"]["type"];
	const scheduleText = $("h1:contains('รอบ')").find("span.text-info").text().trim();
	const qrImageSrc = $("img[src*='qrcode']").attr("src") || "";
	const studentInfoText = $(".col-sm-8.text-left span").first().html() || "";
	const studentIdMatch = studentInfoText.match(/รหัส นศ\. : (\d+)/);
	const studentId = studentIdMatch?.[1] || "";
	const nameMatch = studentInfoText.match(/รหัส นศ\. : \d+<br>\s*(.+?)<br>/);
	const studentName = nameMatch?.[1]?.trim() || "";
	const scheduleParts = scheduleText.split(/\s*,\s*/);
	const day = scheduleParts[0] || "";
	const date = scheduleParts[1] || "";
	const time = scheduleParts[2] || "";

	return {
		destination: {
			name: destinationText,
			type: destinationType,
		},
		schedule: {
			day,
			date,
			time,
			fullSchedule: scheduleText,
		},
		qrCode: {
			imageUrl: qrImageSrc,
		},
		student: {
			studentId,
			name: studentName,
		},
	};
}
