import { startAutoScraper } from "./auto-scraper.js";

async function start() {
	const commands = await startAutoScraper();

	process.on("SIGINT", () => {
		void commands.close().then(() => process.exit(0));
	});

	await new Promise(() => {});
}

start().catch(console.error);
