import * as cheerio from "cheerio";

export interface UserProfileData {
	userId?: string;
	userName?: string;
	fullName?: string;
	displayName?: string;
	profileSection?: string;
}

export function parseUserProfileHTML(html: string): UserProfileData {
	const $ = cheerio.load(html);
	const result: UserProfileData = {};
	const displayName = $("h1.display-5").text().trim();

	if (displayName) {
		result.displayName = displayName;
		result.fullName = displayName;
		result.userName = displayName;
	}

	const profileSections = $(".row.g-4.text-dark.mb-5 .col-sm-12");
	profileSections.each((_index, element) => {
		const text = $(element).text().trim();

		const idMatch = text.match(/(\d{8})/);
		if (idMatch?.[1]) {
			result.userId = idMatch[1];
		}

		if (text && !result.profileSection) {
			result.profileSection = text;
		}
	});

	if (!result.userId || !result.userName) {
		const pageText = $("body").text();

		if (!result.userId) {
			const idMatch = pageText.match(/(\d{8})/);
			if (idMatch?.[1]) {
				result.userId = idMatch[1];
			}
		}

		if (!result.userName && !displayName) {
			const nameMatch = pageText.match(/(นาย|นาง|นางสาว)([ก-๙\s]+)/);
			if (nameMatch?.[0]) {
				result.userName = nameMatch[0].trim();
				result.fullName = nameMatch[0].trim();
			}
		}
	}

	return result;
}
