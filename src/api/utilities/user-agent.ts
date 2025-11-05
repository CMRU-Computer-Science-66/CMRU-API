import UserAgent from "user-agents";

export function generateRandomUserAgent(): string {
	return new UserAgent().toString();
}

export function getAllUserAgents(count: number = 10): string[] {
	return Array.from({ length: count }, () => new UserAgent().toString());
}

export function generateUserAgentByPlatform(platform?: "windows" | "macos" | "linux"): string {
	if (!platform) {
		return generateRandomUserAgent();
	}

	let userAgent: UserAgent;
	let attempts = 0;
	const maxAttempts = 50;

	do {
		userAgent = new UserAgent();
		const uaString = userAgent.toString().toLowerCase();

		switch (platform.toLowerCase()) {
			case "windows":
				if (uaString.includes("windows")) {
					return userAgent.toString();
				}
				break;
			case "macos":
				if (uaString.includes("macintosh") || uaString.includes("mac os")) {
					return userAgent.toString();
				}
				break;
			case "linux":
				if (uaString.includes("linux") && !uaString.includes("android")) {
					return userAgent.toString();
				}
				break;
		}

		attempts++;
	} while (attempts < maxAttempts);

	return new UserAgent().toString();
}
