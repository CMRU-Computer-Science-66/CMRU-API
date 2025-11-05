export function formatCookies(cookies: string | string[]): string {
	if (Array.isArray(cookies)) {
		return cookies
			.map((cookie) => {
				const parts = cookie.split(";");
				return parts[0] ? parts[0].trim() : "";
			})
			.filter((c) => c)
			.join("; ");
	}
	const parts = cookies.split(";");
	return parts[0] ? parts[0].trim() : "";
}

export function parseSetCookieHeader(response: { headers: Record<string, unknown>; rawHeaders?: string[] }): string[] | null {
	let cookieArray: string[] = [];

	if (response.headers["set-cookie"]) {
		cookieArray = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"] : [response.headers["set-cookie"]];
	} else if (response.headers["Set-Cookie"]) {
		cookieArray = Array.isArray(response.headers["Set-Cookie"]) ? response.headers["Set-Cookie"] : [response.headers["Set-Cookie"]];
	} else if ("rawHeaders" in response && Array.isArray(response.rawHeaders)) {
		const rawHeaders = response.rawHeaders;
		for (let i = 0; i < rawHeaders.length - 1; i += 2) {
			const headerName = rawHeaders[i];
			const headerValue = rawHeaders[i + 1];
			if (headerName?.toLowerCase() === "set-cookie" && headerValue) {
				cookieArray.push(headerValue);
			}
		}
	}

	return cookieArray.length > 0 ? cookieArray : null;
}

export function getCookieValue(cookies: string | string[], name: string): string | null {
	const cookieString = Array.isArray(cookies) ? cookies.join("; ") : cookies;

	const match = cookieString.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
	return match ? (match[1] ?? null) : null;
}

export function hasCookie(cookies: string | string[], name: string): boolean {
	return getCookieValue(cookies, name) !== null;
}

export function mergeCookies(...cookieSets: (string | string[] | null | undefined)[]): string {
	const allCookies: string[] = [];

	for (const cookies of cookieSets) {
		if (!cookies) continue;

		if (Array.isArray(cookies)) {
			allCookies.push(...cookies);
		} else {
			allCookies.push(cookies);
		}
	}

	const cookieMap = new Map<string, string>();

	for (const cookie of allCookies) {
		const parts = cookie.split(";")[0]?.trim();
		if (!parts) continue;

		const [name] = parts.split("=");
		if (name) {
			cookieMap.set(name.trim(), parts);
		}
	}

	return Array.from(cookieMap.values()).join("; ");
}

export function parseCookies(cookies: string | string[]): Record<string, string> {
	const cookieString = Array.isArray(cookies) ? cookies.join("; ") : cookies;
	const result: Record<string, string> = {};

	const pairs = cookieString.split(";");
	for (const pair of pairs) {
		const [name, value] = pair.trim().split("=");
		if (name && value) {
			result[name.trim()] = value.trim();
		}
	}

	return result;
}

export function isValidCookieString(cookies: string): boolean {
	if (!cookies || typeof cookies !== "string") {
		return false;
	}

	return /[^=\s]+=.+/.test(cookies);
}

export class CookieManager {
	private cookies: Map<string, string> = new Map();

	set(name: string, value: string): void {
		this.cookies.set(name, value);
	}

	get(name: string): string | undefined {
		return this.cookies.get(name);
	}

	delete(name: string): void {
		this.cookies.delete(name);
	}

	has(name: string): boolean {
		return this.cookies.has(name);
	}

	clear(): void {
		this.cookies.clear();
	}

	load(cookies: string | string[]): void {
		const parsed = parseCookies(cookies);
		for (const [name, value] of Object.entries(parsed)) {
			this.cookies.set(name, value);
		}
	}

	toString(): string {
		return Array.from(this.cookies.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
	}

	toObject(): Record<string, string> {
		return Object.fromEntries(this.cookies);
	}

	size(): number {
		return this.cookies.size;
	}
}

export function createCookieHeader(baseCookies: string | string[], additionalCookies?: Record<string, string>): string {
	let cookieString = formatCookies(baseCookies);

	if (additionalCookies && Object.keys(additionalCookies).length > 0) {
		const additional = Object.entries(additionalCookies)
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");

		cookieString = cookieString ? `${cookieString}; ${additional}` : additional;
	}

	return cookieString;
}
