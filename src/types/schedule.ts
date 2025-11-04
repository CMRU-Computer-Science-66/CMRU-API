export interface ScheduleItem {
	id: number;
	ticketStatus: string;
	destination: string;
	departureDate: string;
	departureTime: string;
	confirmationStatus: "ยืนยันแล้ว" | "เกินเวลายืนยัน";
	travelStatus?: "เดินทางแล้ว" | "ไม่ได้เดินทาง";
	canUnconfirm?: boolean;
	unconfirmData?: string;
}

export interface ScheduleResponse {
	totalItems: number;
	currentPage: number;
	items: ScheduleItem[];
	cookies?: string[];
}

export interface ScheduleMetadata {
	totalItems: number;
	currentPage: number;
	hasQRCode: number;
	alreadyDeparted: number;
	confirmed: number;
	unconfirmed: number;
	traveled: number;
	notTraveled: number;
}
