const args = process.argv.slice(2);
const command = args[0];

if (command === "serve" && !args.includes("--help") && !args.includes("-h")) {
	const forceBun = args.includes("--bun");

	if (forceBun) {
		if (typeof Bun === "undefined") {
			console.error("❌ Error: --bun flag requires Bun runtime");
			console.error("Please run with: bun cmru-api serve --bun");
			process.exit(1);
		}
	}

	await import("./serve");
} else {
	console.log("🚀 CMRU API CLI");
	console.log("\nCommands");
	console.log("     cmru-api serve                       Start API server");
	console.log("\nFlags:");
	console.log("     --bun                                Force Bun runtime");
	console.log("\nOptions:");
	console.log("     PORT=3000                            Set server port (default: 3000)");
	console.log("     HOST=0.0.0.0                         Set server host (default: localhost)");

	process.exit(command && command !== "--help" && command !== "-h" ? 1 : 0);
}
