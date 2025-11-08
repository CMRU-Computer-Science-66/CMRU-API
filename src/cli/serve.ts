import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClient, ApiServer } from "../api";
import { API_ENDPOINTS, printEndpoints, createRoutes, ApiError } from "./endpoints";
import { logger, generateRequestId, PerformanceMonitor } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
const VERSION = packageJson.version;

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

let encryptionPin = "";

const pinArgIndex = process.argv.indexOf("--pin");

if (pinArgIndex !== -1 && pinArgIndex + 1 < process.argv.length) {
	const providedPin = process.argv[pinArgIndex + 1];
	if (providedPin) {
		encryptionPin = providedPin;
		logger.info(`Using custom encryption PIN (length: ${encryptionPin.length})`);
	}
} else {
	logger.info("Using default encryption PIN");
}

(globalThis as { encryptionPin?: string }).encryptionPin = encryptionPin;

const busClient = new ApiClient(ApiServer.BUS);
const regClient = new ApiClient(ApiServer.REG);

const busApi = busClient.api();
const regApi = regClient.api();

const routes = createRoutes(busApi, regApi);

const isBun = typeof Bun !== "undefined";

if (isBun) {
	function jsonResponse(data: unknown, status = 200): Response {
		return new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
			},
		});
	}

	function binaryResponse(data: Buffer, status = 200, contentType = "image/png"): Response {
		return new Response(new Uint8Array(data), {
			status,
			headers: {
				"Content-Type": contentType,
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
			},
		});
	}

	function errorResponse(message: string, status = 400, errorType?: string): Response {
		const responseData: { error: string; errorType?: string } = { error: message };
		if (errorType) {
			responseData.errorType = errorType;
		}
		return jsonResponse(responseData, status);
	}

	async function handleRequest(req: Request): Promise<Response> {
		const startTime = performance.now();
		const requestId = generateRequestId();
		const url = new URL(req.url);
		const pathname = url.pathname;

		logger.info(`Request started`, { method: req.method, pathname, userAgent: req.headers.get("user-agent") }, { requestId });

		const headers = new Headers({
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
		});

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 200, headers });
		}

		let statusCode = 200;
		let response: Response;

		try {
			if (pathname === "/") {
				response = jsonResponse({
					message: "CMRU API Server (Bun Runtime)",
					version: VERSION,
					runtime: "Bun",
					endpoints: API_ENDPOINTS,
				});
			} else if (pathname === "/stats" && req.method === "GET") {
				const stats = PerformanceMonitor.getStats();

				response = jsonResponse(stats);
			} else {
				const route = routes.find((r) => r.path === pathname && r.method === req.method);

				if (route) {
					const headersObj: Record<string, string> = {};
					req.headers.forEach((value, key) => {
						headersObj[key] = value;
					});

					if (req.method === "POST") {
						try {
							const body = await req.json();
							const data = await route.handler(body, url.searchParams, headersObj);
							response = jsonResponse(data);
						} catch (error) {
							if (error instanceof Error && error.message.includes("JSON")) {
								statusCode = 400;
								response = errorResponse("Invalid JSON body", 400);
							} else if (error instanceof ApiError) {
								statusCode = error.statusCode;
								response = errorResponse(error.message, error.statusCode, error.errorType);
							} else {
								statusCode = 500;
								response = errorResponse(error instanceof Error ? error.message : "Request failed", 500);
							}
						}
					} else {
						try {
							const data = await route.handler(undefined, url.searchParams, headersObj);
							if (Buffer.isBuffer(data)) {
								response = binaryResponse(data);
							} else {
								response = jsonResponse(data);
							}
						} catch (error) {
							if (error instanceof ApiError) {
								statusCode = error.statusCode;
								response = errorResponse(error.message, error.statusCode, error.errorType);
							} else {
								statusCode = 500;
								response = errorResponse(error instanceof Error ? error.message : "Request failed", 500);
							}
						}
					}
				} else {
					statusCode = 404;
					response = errorResponse("Endpoint not found", 404);
				}
			}
		} catch (error) {
			logger.error("Server error", error, { requestId });
			statusCode = 500;
			response = errorResponse("Internal server error", 500);
		}

		const responseTime = performance.now() - startTime;

		logger.request(req.method || "UNKNOWN", pathname, statusCode, responseTime, { requestId });
		PerformanceMonitor.recordRequest(pathname, responseTime, statusCode);

		return response;
	}

	const server = Bun.serve({
		port: Number(PORT),
		hostname: HOST,
		fetch: handleRequest,
	});

	const baseURL = `http://${server.hostname}:${server.port}`;
	console.log(`🚀 CMRU API Server running at ${baseURL}`);
	console.log(`⚡ Runtime: Bun ${Bun.version}`);
	console.log(`📚 Endpoint: ${baseURL}`);
	printEndpoints(baseURL);

	let isShuttingDown = false;

	const shutdown = () => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		console.log("\n👋 Shutting down server...");
		void server.stop();
		console.log("✅ Server closed");
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
} else {
	function sendJSON(res: ServerResponse, data: unknown, status = 200) {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(data));
	}

	function sendBinary(res: ServerResponse, data: Buffer, status = 200, contentType = "image/png") {
		res.writeHead(status, {
			"Content-Type": contentType,
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
		});
		res.end(data);
	}

	function sendError(res: ServerResponse, message: string, status = 400, errorType?: string) {
		const responseData: { error: string; errorType?: string } = { error: message };
		if (errorType) {
			responseData.errorType = errorType;
		}
		sendJSON(res, responseData, status);
	}

	async function handleRequest(req: IncomingMessage, res: ServerResponse) {
		const startTime = performance.now();
		const requestId = generateRequestId();
		const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
		const pathname = url.pathname;

		logger.info(`Request started`, { method: req.method, pathname, userAgent: req.headers["user-agent"] }, { requestId });

		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		let statusCode = 200;

		try {
			if (pathname === "/") {
				sendJSON(res, {
					message: "CMRU API Server",
					version: VERSION,
					endpoints: API_ENDPOINTS,
				});
				statusCode = 200;
				return;
			}

			if (pathname === "/stats" && req.method === "GET") {
				const stats = PerformanceMonitor.getStats();
				sendJSON(res, stats);
				statusCode = 200;
				return;
			}

			const route = routes.find((r) => r.path === pathname && r.method === req.method);
			if (route) {
				const headersObj: Record<string, string> = req.headers as Record<string, string>;

				if (req.method === "POST") {
					let body = "";
					req.on("data", (chunk) => {
						body += chunk.toString();
					});
					req.on("end", () => {
						void (async () => {
							try {
								const parsedBody = JSON.parse(body);
								const data = await route.handler(parsedBody, url.searchParams, headersObj);
								sendJSON(res, data);
								statusCode = 200;
							} catch (error) {
								if (error instanceof ApiError) {
									statusCode = error.statusCode;
									sendError(res, error.message, error.statusCode, error.errorType);
								} else {
									statusCode = 500;
									sendError(res, error instanceof Error ? error.message : "Request failed", 500);
								}
								logger.error("Request error", error, { requestId });
							} finally {
								const responseTime = performance.now() - startTime;
								logger.request(req.method || "UNKNOWN", pathname, statusCode, responseTime, { requestId });
								PerformanceMonitor.recordRequest(pathname, responseTime, statusCode);
							}
						})();
					});
				} else {
					try {
						const data = await route.handler(undefined, url.searchParams, headersObj);

						if (Buffer.isBuffer(data)) {
							sendBinary(res, data);
						} else {
							sendJSON(res, data);
						}
						statusCode = 200;
					} catch (error) {
						if (error instanceof ApiError) {
							statusCode = error.statusCode;
							sendError(res, error.message, error.statusCode, error.errorType);
						} else {
							statusCode = 500;
							sendError(res, error instanceof Error ? error.message : "Request failed", 500);
						}
						logger.error("Request error", error, { requestId });
					} finally {
						const responseTime = performance.now() - startTime;
						logger.request(req.method || "UNKNOWN", pathname, statusCode, responseTime, { requestId });
						PerformanceMonitor.recordRequest(pathname, responseTime, statusCode);
					}
				}
				return;
			}

			statusCode = 404;
			sendError(res, "Endpoint not found", 404);
		} catch (error) {
			logger.error("Server error", error, { requestId });
			statusCode = 500;
			sendError(res, "Internal server error", 500);
		} finally {
			if (statusCode !== 200) {
				const responseTime = performance.now() - startTime;
				logger.request(req.method || "UNKNOWN", pathname, statusCode, responseTime, { requestId });
				PerformanceMonitor.recordRequest(pathname, responseTime, statusCode);
			}
		}
	}

	const server = createServer((req, res) => {
		void handleRequest(req, res);
	});

	server.listen(Number(PORT), HOST, () => {
		const baseURL = `http://${HOST}:${PORT}`;
		console.log(`🚀 CMRU API Server running at ${baseURL}`);
		console.log(`📚 Endpoint: ${baseURL}`);
		printEndpoints(baseURL);
	});

	server.on("error", (error) => {
		console.error("Server error:", error);
		process.exit(1);
	});

	let isShuttingDown = false;

	const shutdown = () => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		console.log("\n👋 Shutting down server...");
		server.close(() => {
			console.log("✅ Server closed");
			process.exit(0);
		});
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
