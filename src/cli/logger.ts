import { appendFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

interface LogEntry {
	timestamp: string;
	level: string;
	message: string;
	data?: unknown;
	requestId?: string;
	userId?: string;
}

interface LoggerConfig {
	level: LogLevel;
	logDir?: string;
	maxFileSize?: number;
	maxFiles?: number;
	enableConsole?: boolean;
	enableFile?: boolean;
}

export class Logger {
	private readonly config: Required<LoggerConfig>;
	private readonly logDir: string;
	private currentLogFile: string;
	private currentFileSize = 0;

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = {
			level: LogLevel.INFO,
			logDir: join(__dirname, "../../logs"),
			maxFileSize: 10 * 1024 * 1024, // 10MB
			maxFiles: 5,
			enableConsole: true,
			enableFile: process.env.NODE_ENV === "production",
			...config,
		};

		this.logDir = this.config.logDir;
		this.ensureLogDirectory();
		this.currentLogFile = this.getLogFileName();
	}

	private ensureLogDirectory(): void {
		if (!existsSync(this.logDir)) {
			mkdirSync(this.logDir, { recursive: true });
		}
	}

	private getLogFileName(): string {
		const now = new Date();
		const dateStr = now.toISOString().split("T")[0];
		return join(this.logDir, `cmru-api-${dateStr}.log`);
	}

	private shouldLog(level: LogLevel): boolean {
		return level >= this.config.level;
	}

	private formatMessage(level: LogLevel, message: string, data?: unknown, context?: { requestId?: string; userId?: string }): string {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: LogLevel[level],
			message,
			data,
			requestId: context?.requestId,
			userId: context?.userId,
		};

		return JSON.stringify(entry);
	}

	private writeToFile(logMessage: string): void {
		if (!this.config.enableFile) return;

		try {
			if (this.currentFileSize > this.config.maxFileSize) {
				this.rotateLogFile();
			}

			appendFileSync(this.currentLogFile, logMessage + "\n");
			this.currentFileSize += Buffer.byteLength(logMessage + "\n");
		} catch (error) {
			console.error("Failed to write to log file:", error);
		}
	}

	private rotateLogFile(): void {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const rotatedFile = this.currentLogFile.replace(".log", `-${timestamp}.log`);

		try {
			if (existsSync(this.currentLogFile)) {
				copyFileSync(this.currentLogFile, rotatedFile);
				unlinkSync(this.currentLogFile);
			}

			this.currentLogFile = this.getLogFileName();
			this.currentFileSize = 0;

			this.cleanupOldLogs();
		} catch (error) {
			console.error("Failed to rotate log file:", error);
		}
	}

	private cleanupOldLogs(): void {
		try {
			const files = readdirSync(this.logDir)
				.filter((file: string) => file.startsWith("cmru-api-") && file.endsWith(".log"))
				.map((file: string) => ({
					name: file,
					path: join(this.logDir, file),
					mtime: statSync(join(this.logDir, file)).mtime,
				}))
				.sort((a: { mtime: Date }, b: { mtime: Date }) => b.mtime.getTime() - a.mtime.getTime());

			if (files.length > this.config.maxFiles) {
				const filesToDelete = files.slice(this.config.maxFiles);
				for (const file of filesToDelete) {
					unlinkSync(file.path);
				}
			}
		} catch (error) {
			console.error("Failed to cleanup old logs:", error);
		}
	}

	private writeToConsole(level: LogLevel, message: string, data?: unknown): void {
		if (!this.config.enableConsole) return;

		const timestamp = new Date().toISOString();
		const levelStr = LogLevel[level].padEnd(5);
		const prefix = `[${timestamp}] ${levelStr}`;

		switch (level) {
			case LogLevel.DEBUG:
				console.debug(`${prefix} ${message}`, data ? data : "");
				break;
			case LogLevel.INFO:
				console.info(`${prefix} ${message}`, data ? data : "");
				break;
			case LogLevel.WARN:
				console.warn(`${prefix} ${message}`, data ? data : "");
				break;
			case LogLevel.ERROR:
				console.error(`${prefix} ${message}`, data ? data : "");
				break;
		}
	}

	private log(level: LogLevel, message: string, data?: unknown, context?: { requestId?: string; userId?: string }): void {
		if (!this.shouldLog(level)) return;

		this.writeToConsole(level, message, data);

		if (this.config.enableFile) {
			const logMessage = this.formatMessage(level, message, data, context);
			this.writeToFile(logMessage);
		}
	}

	public debug(message: string, data?: unknown, context?: { requestId?: string; userId?: string }): void {
		this.log(LogLevel.DEBUG, message, data, context);
	}

	public info(message: string, data?: unknown, context?: { requestId?: string; userId?: string }): void {
		this.log(LogLevel.INFO, message, data, context);
	}

	public warn(message: string, data?: unknown, context?: { requestId?: string; userId?: string }): void {
		this.log(LogLevel.WARN, message, data, context);
	}

	public error(message: string, data?: unknown, context?: { requestId?: string; userId?: string }): void {
		this.log(LogLevel.ERROR, message, data, context);
	}

	public request(method: string, path: string, statusCode: number, responseTime: number, context?: { requestId?: string; userId?: string }): void {
		const message = `${method} ${path} ${statusCode} ${responseTime}ms`;
		this.info(message, undefined, context);
	}
}

const logger = new Logger({
	level: process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL, 10) : LogLevel.INFO,
	enableFile: process.env.NODE_ENV === "production",
	enableConsole: true,
});

export { logger };

export function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export class PerformanceMonitor {
	private static requestCounts = new Map<string, number>();
	private static responseTimes = new Map<string, number[]>();
	private static errors = new Map<string, number>();

	public static recordRequest(endpoint: string, responseTime: number, statusCode: number): void {
		const currentCount = this.requestCounts.get(endpoint) || 0;
		this.requestCounts.set(endpoint, currentCount + 1);

		const times = this.responseTimes.get(endpoint) || [];
		times.push(responseTime);

		if (times.length > 100) {
			times.shift();
		}
		this.responseTimes.set(endpoint, times);

		if (statusCode >= 400) {
			const errorCount = this.errors.get(endpoint) || 0;
			this.errors.set(endpoint, errorCount + 1);
		}
	}

	public static getStats(): {
		endpoints: Array<{
			endpoint: string;
			requestCount: number;
			avgResponseTime: number;
			errorCount: number;
			errorRate: number;
		}>;
		totalRequests: number;
		totalErrors: number;
	} {
		const endpoints: Array<{
			endpoint: string;
			requestCount: number;
			avgResponseTime: number;
			errorCount: number;
			errorRate: number;
		}> = [];

		let totalRequests = 0;
		let totalErrors = 0;

		for (const [endpoint, requestCount] of this.requestCounts.entries()) {
			const times = this.responseTimes.get(endpoint) || [];
			const errorCount = this.errors.get(endpoint) || 0;
			const avgResponseTime = times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
			const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

			endpoints.push({
				endpoint,
				requestCount,
				avgResponseTime: Math.round(avgResponseTime * 100) / 100,
				errorCount,
				errorRate: Math.round(errorRate * 100) / 100,
			});

			totalRequests += requestCount;
			totalErrors += errorCount;
		}

		return {
			endpoints: endpoints.sort((a, b) => b.requestCount - a.requestCount),
			totalRequests,
			totalErrors,
		};
	}

	public static reset(): void {
		this.requestCounts.clear();
		this.responseTimes.clear();
		this.errors.clear();
	}
}
