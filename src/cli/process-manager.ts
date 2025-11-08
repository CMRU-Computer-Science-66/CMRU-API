import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ProcessManagerConfig {
	maxRestarts: number;
	restartDelay: number;
	crashThreshold: number;
	crashWindow: number;
}

export class ProcessManager {
	private process: ChildProcess | null = null;
	private restartCount = 0;
	private crashTimes: number[] = [];
	private isShuttingDown = false;
	private readonly config: ProcessManagerConfig;

	constructor(config: Partial<ProcessManagerConfig> = {}) {
		this.config = {
			maxRestarts: config.maxRestarts ?? 10,
			restartDelay: config.restartDelay ?? 5000,
			crashThreshold: config.crashThreshold ?? 5,
			crashWindow: config.crashWindow ?? 300000,
		};
	}

	public start(args: string[] = []): void {
		if (this.isShuttingDown) {
			console.log("🚫 Process manager is shutting down, ignoring start request");
			return;
		}

		console.log(`🚀 Starting CMRU API Server (attempt ${this.restartCount + 1})`);

		const scriptPath = join(__dirname, "serve.ts");
		const isBun = typeof Bun !== "undefined";

		const processArgs = isBun ? ["run", scriptPath, ...args] : [scriptPath, ...args];
		const command = isBun ? "bun" : "node";

		this.process = spawn(command, processArgs, {
			stdio: "inherit",
			env: { ...process.env },
		});

		this.process.on("exit", (code, signal) => {
			if (this.isShuttingDown) {
				console.log("✅ Process exited during shutdown");
				return;
			}

			console.log(`⚠️ Process exited with code ${code}, signal: ${signal}`);
			this.handleCrash();
		});

		this.process.on("error", (error) => {
			console.error("❌ Process error:", error);
			this.handleCrash();
		});

		this.setupGracefulShutdown();
	}

	private handleCrash(): void {
		if (this.isShuttingDown) return;

		const now = Date.now();
		this.crashTimes.push(now);
		this.crashTimes = this.crashTimes.filter((time) => now - time < this.config.crashWindow);

		if (this.crashTimes.length >= this.config.crashThreshold) {
			console.error(`❌ Too many crashes (${this.crashTimes.length}) within ${this.config.crashWindow / 1000} seconds. Stopping auto-restart.`);
			this.stop();
			return;
		}

		if (this.restartCount >= this.config.maxRestarts) {
			console.error(`❌ Max restarts (${this.config.maxRestarts}) exceeded. Stopping auto-restart.`);
			this.stop();
			return;
		}

		this.restartCount++;
		console.log(`⏱️ Restarting in ${this.config.restartDelay}ms...`);

		setTimeout(() => {
			if (!this.isShuttingDown) {
				this.start();
			}
		}, this.config.restartDelay);
	}

	public stop(): void {
		this.isShuttingDown = true;

		if (this.process && !this.process.killed) {
			console.log("🛑 Stopping process...");

			this.process.kill("SIGTERM");

			setTimeout(() => {
				if (this.process && !this.process.killed) {
					console.log("🔪 Force killing process...");
					this.process.kill("SIGKILL");
				}
			}, 10000);
		}
	}

	public getStatus(): {
		isRunning: boolean;
		restartCount: number;
		crashCount: number;
		pid?: number;
	} {
		return {
			isRunning: this.process !== null && !this.process.killed,
			restartCount: this.restartCount,
			crashCount: this.crashTimes.length,
			pid: this.process?.pid,
		};
	}

	private setupGracefulShutdown(): void {
		const shutdown = () => {
			console.log("\n👋 Received shutdown signal, stopping process manager...");
			this.stop();
			process.exit(0);
		};

		process.on("SIGTERM", shutdown);
		process.on("SIGINT", shutdown);
		process.on("SIGHUP", shutdown);
	}
}
