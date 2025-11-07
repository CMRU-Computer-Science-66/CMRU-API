import * as cheerio from "cheerio";

export enum DayOfWeek {
	SUNDAY = "วันอาทิตย์",
	MONDAY = "วันจันทร์",
	TUESDAY = "วันอังคาร",
	WEDNESDAY = "วันพุธ",
	THURSDAY = "วันพฤหัสบดี",
	FRIDAY = "วันศุกร์",
	SATURDAY = "วันเสาร์",
}

export enum ConfirmationStatus {
	CONFIRMED = "ยืนยันแล้ว",
	OVERTIME = "เกินเวลายืนยัน",
	PENDING = "รอยืนยัน",
}

export interface ScheduleReservation {
	id: number;
	ticket: {
		id: number | null;
		hasQRCode: boolean;
		status: string;
	};
	destination: {
		name: string;
		type: "เวียงบัว" | "แม่ริม";
	};
	departureDate: DayOfWeek;
	departureTime: string;
	date: Date;
	confirmation: {
		isConfirmed: boolean;
		canConfirm: boolean;
		confirmData?: string;
		canCancel: boolean;
		unconfirmData?: string;
		status: ConfirmationStatus;
	};
	actions: {
		canDelete: boolean;
		deleteUrl?: string;
		reservationId?: string | number;
	};
	travelStatus: {
		hasCompleted: boolean | null;
		status: string | null;
	};
}

export interface ParsedScheduleData {
	userInfo: {
		name: string;
	};
	totalReservations: number;
	currentPage: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
	reservations: ScheduleReservation[];
}

export function parseScheduleHTML(html: string): ParsedScheduleData {
	const $ = cheerio.load(html);
	const userName = $("#alert-Top h4").text().trim();
	const totalText = $(".pagination .title span").text();
	const totalReservations = parseInt(totalText) || 0;
	const currentPage = parseInt($(".pagination .activex").text()) || 1;
	const pageNumbers: number[] = [];

	$(".pagination li.activex, .pagination li.numlink").each((_index: number, element) => {
		const pageNum = parseInt($(element).text().trim());
		if (!isNaN(pageNum)) {
			pageNumbers.push(pageNum);
		}
	});

	const totalPages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
	const hasNextPage = currentPage < totalPages;
	const hasPrevPage = currentPage > 1;

	const reservations: ScheduleReservation[] = [];

	$("table.table tbody tr").each((_index: number, element) => {
		const $row = $(element);
		const $cells = $row.find("td");

		if ($cells.length < 6) return;

		const id = parseInt($cells.eq(0).text().trim());
		const ticketCell = $cells.eq(1);

		let ticketId = null;
		const qrLink = ticketCell.find("a");

		if (qrLink.length > 0) {
			const onclickAttr = qrLink.attr("onclick");
			const urlMatch = onclickAttr?.match(/openNewWindow\('([^']+)'\)/);

			if (urlMatch && urlMatch[1]) {
				const fullUrl = urlMatch[1];
				const pathMatch = fullUrl.match(/\/users\/schedule\/showticket\/(\d+)/);

				if (pathMatch && pathMatch[1]) {
					ticketId = parseInt(pathMatch[1]);
				}
			}
		}

		const hasQRCode = ticketId !== null && ticketCell.find("i.fa-qrcode").length > 0;

		let ticketStatus;
		if (hasQRCode) {
			ticketStatus = qrLink.text().trim() || "รอเดินทาง";
		} else {
			ticketStatus = ticketCell.text().trim() || "รอถึงเวลา";
		}

		const destinationCell = $cells.eq(2);
		const destinationName = destinationCell.find("span").text().trim();
		const destinationType = destinationName as ScheduleReservation["destination"]["type"];

		const departureText = $cells.eq(3).text().trim();
		const parts = departureText.split(/\s*,\s*/);
		const timePart = parts[parts.length - 1] || "";
		const datePart = parts[0] || "";
		const dateTextPart = parts[1] || "";

		const dayMatch = datePart?.match(/^(\S+)\s*,?\s*/);
		const dayOfWeekText = dayMatch?.[1] || "";

		const dayMap: Record<string, DayOfWeek> = {
			อา: DayOfWeek.SUNDAY,
			จ: DayOfWeek.MONDAY,
			อ: DayOfWeek.TUESDAY,
			พ: DayOfWeek.WEDNESDAY,
			พฤ: DayOfWeek.THURSDAY,
			ศ: DayOfWeek.FRIDAY,
			ส: DayOfWeek.SATURDAY,
		};
		const dayOfWeek = dayMap[dayOfWeekText] || DayOfWeek.MONDAY;
		const timeMatch = timePart?.match(/(\d+)\.(\d+)/);
		const hours = timeMatch ? parseInt(timeMatch[1] || "0") : 0;
		const minutes = timeMatch ? parseInt(timeMatch[2] || "0") : 0;
		const departureTime = timeMatch ? `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}` : "00.00";
		const thaiMonthMap: Record<string, number> = {
			"ม.ค.": 0,
			"ก.พ.": 1,
			"มี.ค.": 2,
			"เม.ย.": 3,
			"พ.ค.": 4,
			"มิ.ย.": 5,
			"ก.ค.": 6,
			"ส.ค.": 7,
			"ก.ย.": 8,
			"ต.ค.": 9,
			"พ.ย.": 10,
			"ธ.ค.": 11,
		};

		let fullDate = new Date();
		const dateMatch = dateTextPart.trim().match(/(\d+)\s+(\S+)\s+(\d+)/);
		if (dateMatch) {
			const day = parseInt(dateMatch[1] || "1");
			const thaiMonth = dateMatch[2] || "";
			const buddhistYear = parseInt(dateMatch[3] || "68");

			const month = thaiMonthMap[thaiMonth] ?? 0;
			const christianYear = buddhistYear + 2500 - 543;

			fullDate = new Date(christianYear, month, day, hours, minutes, 0, 0);
		} else {
			fullDate.setHours(hours, minutes, 0, 0);
		}

		const confirmationCell = $cells.eq(4);
		const isConfirmed = confirmationCell.find(".badge-success").length > 0 && confirmationCell.find(".badge-success i.fa-check").length > 0;

		const confirmLink = confirmationCell.find("a.badge-success");
		const canConfirm = confirmLink.length > 0;
		let confirmData: string | undefined;
		if (canConfirm) {
			const onclickAttr = confirmLink.attr("onclick");
			const match = onclickAttr?.match(/confirmReserv\('([^']+)'\)/);
			if (match && match[1]) {
				confirmData = match[1];
			}
		}

		const unconfirmLink = confirmationCell.find("a.badge-warning");
		const canCancel = unconfirmLink.length > 0;
		let unconfirmData: string | undefined;
		if (canCancel) {
			const onclickAttr = unconfirmLink.attr("onclick");
			const match = onclickAttr?.match(/unconfirmReserv\('([^']+)'\)/);
			if (match && match[1]) {
				unconfirmData = match[1];
			}
		}

		const deleteLink = confirmationCell.find("a.badge-danger");
		const canDelete = deleteLink.length > 0;
		let deleteUrl: string | undefined;
		let reservationId: string | number | undefined;
		if (canDelete) {
			const onclickAttr = deleteLink.attr("onclick");
			const match = onclickAttr?.match(/confirm\('([^']+)'\)/);
			if (match && match[1]) {
				deleteUrl = match[1];

				const idMatch = deleteUrl.match(/\/delt\/(\d+)/);

				if (idMatch && idMatch[1]) {
					reservationId = parseInt(idMatch[1]);
				}
			}
		}

		const confirmationStatusText = confirmationCell.find(".badge").first().text().trim();

		let confirmationStatus: ConfirmationStatus = ConfirmationStatus.PENDING;
		if (confirmationStatusText.includes("ยืนยันแล้ว")) {
			confirmationStatus = ConfirmationStatus.CONFIRMED;
		} else if (confirmationStatusText.includes("เกินเวลา")) {
			confirmationStatus = ConfirmationStatus.OVERTIME;
		}

		const travelCell = $cells.eq(5);
		const travelBadge = travelCell.find(".badge");
		let hasCompleted: boolean | null = null;
		let travelStatus: string | null = null;

		if (travelBadge.length > 0) {
			if (travelBadge.hasClass("badge-success")) {
				hasCompleted = true;
			} else if (travelBadge.hasClass("badge-danger")) {
				hasCompleted = false;
			}
			travelStatus = travelBadge.text().trim();
		}

		reservations.push({
			id,
			ticket: {
				id: ticketId,
				hasQRCode,
				status: ticketStatus,
			},
			destination: {
				name: destinationName,
				type: destinationType,
			},
			departureDate: dayOfWeek,
			departureTime,
			date: fullDate,
			confirmation: {
				isConfirmed,
				canConfirm,
				confirmData,
				canCancel,
				unconfirmData,
				status: confirmationStatus,
			},
			actions: {
				canDelete,
				deleteUrl,
				reservationId,
			},
			travelStatus: {
				hasCompleted,
				status: travelStatus,
			},
		});
	});

	return {
		userInfo: {
			name: userName,
		},
		totalReservations,
		currentPage,
		totalPages,
		hasNextPage,
		hasPrevPage,
		reservations,
	};
}
