export interface ScraperConfig {
	baseUrl: string;
	outputDir: string;
	browserOptions?: {
		headless?: boolean;
		devtools?: boolean;
		slowMo?: number;
		defaultViewport?: {
			width: number;
			height: number;
		};
	};
	timeout?: number;
	waitForSelector?: string;
	additionalWait?: number;
}

export interface ExportResult {
	url: string;
	filePath: string;
	timestamp: Date;
	success: boolean;
	error?: string;
	title?: string;
	fileSize?: number;
}

export interface ScrapingSession {
	id: string;
	browserId?: string;
	currentUrl?: string;
	exports: ExportResult[];
	startTime: Date;
	isActive: boolean;
}

export interface ScraperCommands {
	save: (filename?: string) => Promise<ExportResult>;
	navigate: (url: string) => Promise<void>;
	getPageInfo: () => Promise<{
		url: string;
		title: string;
		readyState: string;
	}>;
	close: () => Promise<void>;
	screenshot: (filename?: string) => Promise<string>;
}
