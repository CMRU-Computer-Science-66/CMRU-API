import * as cheerio from "cheerio";
export interface PaginationInfo {
	currentPage: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	totalItems?: number;
	itemsPerPage?: number;
	pageLinks?: PageLink[];
}

export interface PageLink {
	page: number;
	url?: string;
	isActive?: boolean;
	text?: string;
}

export interface PaginatedResult<T> {
	data: T;
	pagination: PaginationInfo;
	isComplete: boolean;
}

export interface PaginationOptions {
	page?: number;
	itemsPerPage?: number;
	fetchAllPages?: boolean;
	maxPages?: number;
}

export function parsePaginationFromHTML(html: string): PaginationInfo {
	const $ = cheerio.load(html);
	const pagination: PaginationInfo = {
		currentPage: 1,
		totalPages: 1,
		hasNextPage: false,
		hasPreviousPage: false,
		pageLinks: [],
	};

	const pageLinks: PageLink[] = [];
	$("a[onclick*='Setpostform']").each((_index: number, element: any) => {
		const onclick = $(element).attr("onclick") || "";
		const text = $(element).text().trim();

		const pageMatch = onclick.match(/[?&](?:page|p)=(\d+)/i);
		if (pageMatch && pageMatch[1]) {
			const pageNum = parseInt(pageMatch[1]);
			pageLinks.push({
				page: pageNum,
				url: onclick,
				text,
				isActive: $(element).hasClass("active") || $(element).hasClass("current"),
			});
		}
	});

	$(".pagination, .pager, .page-nav")
		.find("a, span")
		.each((_index: number, element: any) => {
			const text = $(element).text().trim();
			const pageNum = parseInt(text);

			if (!isNaN(pageNum)) {
				pageLinks.push({
					page: pageNum,
					text,
					isActive: $(element).hasClass("active") || $(element).hasClass("current"),
				});
			}
		});

	const bodyText = $("body").text();
	const currentPageMatch = bodyText.match(/หน้า\s*(\d+)\s*จาก\s*(\d+)/i) || bodyText.match(/page\s*(\d+)\s*of\s*(\d+)/i) || bodyText.match(/(\d+)\s*\/\s*(\d+)/);

	if (currentPageMatch && currentPageMatch[1] && currentPageMatch[2]) {
		pagination.currentPage = parseInt(currentPageMatch[1]);
		pagination.totalPages = parseInt(currentPageMatch[2]);
	}

	if (pageLinks.length > 0) {
		const activeLink = pageLinks.find((link) => link.isActive);
		if (activeLink) {
			pagination.currentPage = activeLink.page;
		}

		const maxPage = Math.max(...pageLinks.map((link) => link.page));
		if (maxPage > pagination.totalPages) {
			pagination.totalPages = maxPage;
		}

		pagination.pageLinks = pageLinks.sort((a, b) => a.page - b.page);
	}

	pagination.hasPreviousPage = pagination.currentPage > 1;
	pagination.hasNextPage = pagination.currentPage < pagination.totalPages;

	return pagination;
}
