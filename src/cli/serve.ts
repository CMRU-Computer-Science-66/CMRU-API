import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClient, ApiServer } from "../api";
import { API_ENDPOINTS, printEndpoints, createRoutes, ApiError } from "./endpoints";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
const VERSION = packageJson.version;

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

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
				"Access-Control-Allow-Headers": "Content-Type",
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
		const url = new URL(req.url);
		const pathname = url.pathname;
		const timestamp = new Date().toISOString();

		console.log(`[${timestamp}] ${req.method} ${pathname}`);

		const headers = new Headers({
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		});

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 200, headers });
		}

		try {
			if (pathname === "/") {
				return jsonResponse({
					message: "CMRU API Server (Bun Runtime)",
					version: VERSION,
					runtime: "Bun",
					endpoints: API_ENDPOINTS,
				});
			}

			const route = routes.find((r) => r.path === pathname && r.method === req.method);

			if (route) {
				if (req.method === "POST") {
					try {
						const body = await req.json();
						const data = await route.handler(body);
						return jsonResponse(data);
					} catch (error) {
						if (error instanceof Error && error.message.includes("JSON")) {
							return errorResponse("Invalid JSON body", 400);
						}
						if (error instanceof ApiError) {
							return errorResponse(error.message, error.statusCode, error.errorType);
						}
						return errorResponse(error instanceof Error ? error.message : "Request failed", 500);
					}
				} else {
					try {
						const data = await route.handler();
						return jsonResponse(data);
					} catch (error) {
						if (error instanceof ApiError) {
							return errorResponse(error.message, error.statusCode, error.errorType);
						}
						return errorResponse(error instanceof Error ? error.message : "Request failed", 500);
					}
				}
			}

			return errorResponse("Endpoint not found", 404);
		} catch (error) {
			console.error("Server error:", error);
			return errorResponse("Internal server error", 500);
		}
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

	function sendError(res: ServerResponse, message: string, status = 400, errorType?: string) {
		const responseData: { error: string; errorType?: string } = { error: message };
		if (errorType) {
			responseData.errorType = errorType;
		}
		sendJSON(res, responseData, status);
	}

	async function handleRequest(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
		const pathname = url.pathname;
		const timestamp = new Date().toISOString();

		console.log(`[${timestamp}] ${req.method} ${pathname}`);

		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		try {
			if (pathname === "/") {
				sendJSON(res, {
					message: "CMRU API Server",
					version: VERSION,
					endpoints: API_ENDPOINTS,
				});
				return;
			}

			const route = routes.find((r) => r.path === pathname && r.method === req.method);
			if (route) {
				if (req.method === "POST") {
					let body = "";
					req.on("data", (chunk) => {
						body += chunk.toString();
					});
					req.on("end", () => {
						void (async () => {
							try {
								const parsedBody = JSON.parse(body);
								const data = await route.handler(parsedBody);
								sendJSON(res, data);
							} catch (error) {
								if (error instanceof ApiError) {
									sendError(res, error.message, error.statusCode, error.errorType);
								} else {
									sendError(res, error instanceof Error ? error.message : "Request failed", 500);
								}
							}
						})();
					});
				} else {
					try {
						const data = await route.handler();
						sendJSON(res, data);
					} catch (error) {
						if (error instanceof ApiError) {
							sendError(res, error.message, error.statusCode, error.errorType);
						} else {
							sendError(res, error instanceof Error ? error.message : "Request failed", 500);
						}
					}
				}
				return;
			}

			sendError(res, "Endpoint not found", 404);
		} catch (error) {
			console.error("Server error:", error);
			sendError(res, "Internal server error", 500);
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
