import puppeteer, { type Browser, type Page } from "puppeteer";
import * as fs from "fs/promises";
import * as path from "path";
import type { ScraperConfig, ExportResult, ScrapingSession, ScraperCommands } from "./types.js";

export class CmruPuppeteerScraper {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private session: ScrapingSession;
	private config: ScraperConfig;

	constructor(config: Partial<ScraperConfig> = {}) {
		this.config = {
			baseUrl: "https://reg.cmru.ac.th/",
			outputDir: "./scraper-output",
			browserOptions: {
				headless: false,
				devtools: true,
				slowMo: 100,
			},
			timeout: 30000,
			additionalWait: 1000,
			...config,
		};

		this.session = {
			id: this.generateSessionId(),
			startTime: new Date(),
			exports: [],
			isActive: false,
		};
	}

	async launch(): Promise<ScraperCommands> {
		try {
			console.log("🚀 Launching Chrome browser...");
			this.browser = await puppeteer.launch(this.config.browserOptions);

			this.page = await this.browser.newPage();
			// eslint-disable-next-line @typescript-eslint/await-thenable
			await this.page.setDefaultTimeout(this.config.timeout || 30000);

			await this.page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

			this.session.isActive = true;

			await this.ensureOutputDirectory();

			console.log(`🌐 Navigating to ${this.config.baseUrl}...`);
			await this.page.goto(this.config.baseUrl, { waitUntil: "networkidle2" });

			if (this.config.additionalWait) {
				await new Promise<void>((resolve) => {
					setTimeout(resolve, this.config.additionalWait);
				});
			}

			console.log("✅ Browser launched successfully!");
			console.log("📝 You can now manually navigate to different pages.");
			console.log("🔧 Use the returned commands to save HTML or take screenshots.");

			return this.createCommands();
		} catch (error) {
			console.error("❌ Failed to launch browser:", error);
			throw error;
		}
	}

	private createCommands(): ScraperCommands {
		return {
			save: this.saveCurrentPage.bind(this),
			navigate: this.navigate.bind(this),
			getPageInfo: this.getPageInfo.bind(this),
			close: this.close.bind(this),
			screenshot: this.takeScreenshot.bind(this),
		};
	}

	async saveCurrentPage(filename?: string): Promise<ExportResult> {
		if (!this.page) {
			throw new Error("Browser not initialized. Call launch() first.");
		}

		try {
			const pageInfo = await this.getPageInfo();
			const timestamp = new Date();

			if (!filename) {
				const urlPath = new URL(pageInfo.url).pathname;
				const cleanPath = urlPath
					.replace(/[^a-zA-Z0-9]/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_|_$/g, "");
				filename = `${cleanPath || "index"}_${timestamp.getTime()}.html`;
			}

			if (!filename.endsWith(".html")) {
				filename += ".html";
			}

			const filePath = path.join(this.config.outputDir, filename);
			const html = await this.page.content();
			await fs.writeFile(filePath, html, "utf-8");
			const stats = await fs.stat(filePath);

			const result: ExportResult = {
				url: pageInfo.url,
				filePath,
				timestamp,
				success: true,
				title: pageInfo.title,
				fileSize: stats.size,
			};

			this.session.exports.push(result);

			console.log(`💾 HTML saved: ${filename} (${this.formatFileSize(stats.size)})`);
			console.log(`📍 Location: ${filePath}`);

			return result;
		} catch (error) {
			const result: ExportResult = {
				url: this.page?.url() || "unknown",
				filePath: "",
				timestamp: new Date(),
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};

			console.error("❌ Failed to save HTML:", error);
			return result;
		}
	}

	async navigate(url: string): Promise<void> {
		if (!this.page) {
			throw new Error("Browser not initialized. Call launch() first.");
		}

		try {
			console.log(`🌐 Navigating to ${url}...`);
			await this.page.goto(url, { waitUntil: "networkidle2" });

			if (this.config.additionalWait) {
				await new Promise((resolve) => setTimeout(resolve, this.config.additionalWait));
			}

			console.log("✅ Navigation completed");
		} catch (error) {
			console.error("❌ Navigation failed:", error);
			throw error;
		}
	}

	async getPageInfo(): Promise<{ url: string; title: string; readyState: string }> {
		if (!this.page) {
			throw new Error("Browser not initialized. Call launch() first.");
		}

		const url = this.page.url();
		const [title, readyState] = await Promise.all([this.page.title(), this.page.evaluate(() => document.readyState)]);

		return { url, title, readyState };
	}

	async takeScreenshot(filename?: string): Promise<string> {
		if (!this.page) {
			throw new Error("Browser not initialized. Call launch() first.");
		}

		try {
			const timestamp = new Date();

			if (!filename) {
				const pageInfo = await this.getPageInfo();
				const urlPath = new URL(pageInfo.url).pathname;
				const cleanPath = urlPath
					.replace(/[^a-zA-Z0-9]/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_|_$/g, "");
				filename = `${cleanPath || "index"}_${timestamp.getTime()}.png`;
			}

			if (!filename.endsWith(".png")) {
				filename += ".png";
			}

			const filePath = path.join(this.config.outputDir, filename);

			await this.page.screenshot({
				path: filePath as `${string}.png`,
				fullPage: true,
				type: "png",
			});

			console.log(`📸 Screenshot saved: ${filename}`);
			console.log(`📍 Location: ${filePath}`);

			return filePath;
		} catch (error) {
			console.error("❌ Failed to take screenshot:", error);
			throw error;
		}
	}

	async close(): Promise<void> {
		try {
			if (this.browser) {
				await this.browser.close();
				this.browser = null;
				this.page = null;
			}

			this.session.isActive = false;

			console.log("🔒 Browser closed successfully");
			console.log(`📊 Session summary: ${this.session.exports.length} pages exported`);

			if (this.session.exports.length > 0) {
				console.log("\n📋 Exported files:");
				for (const result of this.session.exports) {
					if (result.success) {
						console.log(`  ✅ ${path.basename(result.filePath)} - ${result.title}`);
					} else {
						console.log(`  ❌ Failed: ${result.url} - ${result.error}`);
					}
				}
			}
		} catch (error) {
			console.error("❌ Error closing browser:", error);
			throw error;
		}
	}

	getSession(): ScrapingSession {
		return { ...this.session };
	}

	private async ensureOutputDirectory(): Promise<void> {
		try {
			await fs.access(this.config.outputDir);
		} catch {
			await fs.mkdir(this.config.outputDir, { recursive: true });
			console.log(`📁 Created output directory: ${this.config.outputDir}`);
		}
	}

	private generateSessionId(): string {
		return `scraper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private formatFileSize(bytes: number): string {
		const units = ["B", "KB", "MB", "GB"];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}
}
