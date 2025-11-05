import * as cheerio from "cheerio";

export interface AvailableBusSchedule {
	id: number;
	title: string;
	destination: "แม่ริม" | "เวียงบัว";
	destinationType: 1 | 2;
	departureDateTime: Date;
	departureDate: string;
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

			availableSchedules.push({
				id: parseInt(schId),
				title: title.trim(),
				destination,
				destinationType,
				departureDateTime: new Date(start),
				departureDate: schDate,
				canReserve,
				isReserved: !canReserve,
				requiresLogin,
			});
		}
	}

	availableSchedules.sort((a, b) => a.departureDateTime.getTime() - b.departureDateTime.getTime());

	return {
		currentMonth,
		availableSchedules,
		totalAvailable: availableSchedules.length,
	};
}
