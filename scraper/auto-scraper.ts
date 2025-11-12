/* eslint-disable @typescript-eslint/no-misused-promises */
import puppeteer, { type Browser, type Page } from "puppeteer";
import * as fs from "fs/promises";
import * as path from "path";

export class AutoSaveCmruScraper {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private outputDir = "./scraper-output";
	private savedUrls = new Set<string>();

	async launch() {
		console.log("🚀 Launching Chrome browser...");

		this.browser = await puppeteer.launch({
			headless: false,
			devtools: true,
			args: ["--start-maximized"],
		});

		const pages = await this.browser.pages();
		this.page = pages[0] || (await this.browser.newPage());

		await this.page.setViewport(null);
		await this.ensureOutputDirectory();

		const busPage = await this.browser.newPage();
		await busPage.setViewport(null);

		this.setupAutoSaveForPage(this.page);
		this.setupAutoSaveForPage(busPage);

		await this.page.goto("https://reg.cmru.ac.th/", { waitUntil: "networkidle2" });
		await busPage.goto("https://cmrubus.cmru.ac.th/", { waitUntil: "networkidle2" });

		console.log("✅ Chrome launched! Auto-saving HTML files to ./scraper-output/reg/ and ./scraper-output/bus/");

		return {
			close: this.close.bind(this),
			getStats: this.getStats.bind(this),
		};
	}

	private setupAutoSaveForPage(page: Page) {
		if (!page) return;

		page.on("framenavigated", async (frame) => {
			if (frame === page.mainFrame()) {
				const url = frame.url();

				if (this.isCmruRelatedPage(url)) {
					await this.saveCurrentPageFromPage(url, page);
				}
			}
		});

		page.on("load", async () => {
			const url = page.url();
			if (url && this.isCmruRelatedPage(url)) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				await this.saveCurrentPageFromPage(url, page);
			}
		});
	}

	private isCmruRelatedPage(url: string): boolean {
		if (url.startsWith("about:") || url.startsWith("chrome:") || url.startsWith("devtools:")) {
			return false;
		}

		return url.toLowerCase().includes("reg.cmru.ac.th") || url.toLowerCase().includes("cmrubus.cmru.ac.th");
	}

	private getPageType(url: string): "reg" | "bus" | "other" {
		const lowerUrl = url.toLowerCase();

		if (lowerUrl.includes("reg.cmru.ac.th")) {
			return "reg";
		}

		if (lowerUrl.includes("cmrubus.cmru.ac.th")) {
			return "bus";
		}

		return "other";
	}

	private async saveCurrentPageFromPage(url: string, page: Page) {
		if (!page) return;

		try {
			const title = await page.title();
			const timestamp = new Date();

			const urlPath = new URL(url).pathname;
			const cleanPath = urlPath
				.replace(/[^a-zA-Z0-9]/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_|_$/g, "");

			const filename = `${cleanPath || "index"}.html`;
			const pageType = this.getPageType(url);
			const typeDir = path.join(this.outputDir, pageType);
			await this.ensureDirectory(typeDir);

			const filePath = path.join(typeDir, filename);

			let html = await page.content();
			html = this.addMetadata(html, url, title, timestamp);

			await fs.writeFile(filePath, html, "utf-8");
			this.savedUrls.add(url);

			console.log(`💾 Saved: ${path.basename(filePath)}`);
		} catch (error) {
			console.error("❌ Error saving page:", error);
		}
	}

	private async ensureOutputDirectory() {
		try {
			await fs.access(this.outputDir);
		} catch {
			await fs.mkdir(this.outputDir, { recursive: true });
		}
	}

	private async ensureDirectory(dirPath: string) {
		try {
			await fs.access(dirPath);
		} catch {
			await fs.mkdir(dirPath, { recursive: true });
		}
	}

	private addMetadata(html: string, url: string, title: string, timestamp: Date): string {
		const metadata = `
<!-- 
=== CMRU Scraper Metadata ===
Original URL: ${url}
Page Title: ${title}
Scraped At: ${timestamp.toISOString()}
Scraped At (Thai): ${timestamp.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
User Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
=== End Metadata ===
-->
`;

		if (html.includes("<head>")) {
			return html.replace("<head>", `<head>${metadata}`);
		} else if (html.includes("<html>")) {
			return html.replace("<html>", `<html>${metadata}`);
		} else {
			return metadata + html;
		}
	}

	async close() {
		if (this.browser) {
			await this.browser.close();
			console.log(`🔒 Browser closed - ${this.savedUrls.size} pages saved`);
		}
	}

	getStats() {
		return {
			savedPages: this.savedUrls.size,
			savedUrls: Array.from(this.savedUrls),
		};
	}
}

export async function startAutoScraper() {
	const scraper = new AutoSaveCmruScraper();
	return await scraper.launch();
}
