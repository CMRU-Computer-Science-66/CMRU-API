import * as cheerio from "cheerio";
import { DayOfWeek } from "./schedule";

export interface AvailableBusSchedule {
	id: number;
	title: string;
	destination: "แม่ริม" | "เวียงบัว";
	destinationType: 1 | 2;
	departureDate: DayOfWeek;
	date: Date;
	departureTime: string;
	canReserve: boolean;
	isReserved: boolean;
	requiresLogin: boolean;
}

export interface AvailableBusData {
	currentMonth: string;
	availableSchedules: AvailableBusSchedule[];
	totalAvailable: number;
}

export function parseAvailableBusHTML(html: string): AvailableBusData {
	const $ = cheerio.load(html);

	const availableSchedules: AvailableBusSchedule[] = [];
	const currentMonth = ($("#sMonth option[selected]").val() as string) || "";
	const scriptContent = $("script").text();
	const eventsMatch = scriptContent.match(/events:\s*\[(.+)\]\s*\n/);

	if (eventsMatch && eventsMatch[1]) {
		const eventsString = eventsMatch[1];
		const eventRegex =
			/\{title:\s*'([^']+)',\s*start:\s*'([^']+)',\s*schDate:\s*'([^']+)',\s*SchId:\s*'(\d+)',\s*scd_type:\s*'(\d+)',\s*reservStatus:\s*'(\d*)',\s*signinStatus:\s*'(\d*)',\s*classNames:\s*\['([^']+)'\]\}/g;

		let match;
		while ((match = eventRegex.exec(eventsString)) !== null) {
			const [, title, start, schDate, schId, scdType, reservStatus, signinStatus] = match;

			if (!title || !start || !schDate || !schId || !scdType) continue;

			const destinationType = parseInt(scdType) as 1 | 2;
			const destination = destinationType === 1 ? "แม่ริม" : "เวียงบัว";

			const canReserve = reservStatus === "1";
			const requiresLogin = signinStatus === "1";
			const dateObj = new Date(start);
			const dayIndex = dateObj.getDay();
			const dayOfWeekMap: DayOfWeek[] = [
				DayOfWeek.SUNDAY,
				DayOfWeek.MONDAY,
				DayOfWeek.TUESDAY,
				DayOfWeek.WEDNESDAY,
				DayOfWeek.THURSDAY,
				DayOfWeek.FRIDAY,
				DayOfWeek.SATURDAY,
			];
			const departureDate = dayOfWeekMap[dayIndex] || DayOfWeek.MONDAY;
			const hours = dateObj.getHours();
			const minutes = dateObj.getMinutes();
			const departureTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

			availableSchedules.push({
				id: parseInt(schId),
				title: title.trim(),
				destination,
				destinationType,
				departureDate,
				date: dateObj,
				departureTime,
				canReserve,
				isReserved: !canReserve,
				requiresLogin,
			});
		}
	}

	availableSchedules.sort((a, b) => a.date.getTime() - b.date.getTime());

	return {
		currentMonth,
		availableSchedules,
		totalAvailable: availableSchedules.length,
	};
}
