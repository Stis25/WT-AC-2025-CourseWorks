import { Prisma, PrismaClient } from "@prisma/client";

import { config } from "../config";

function isTruthyEnv(value: string | undefined): boolean {
	if (!value) return false;
	return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

// По умолчанию печатаем все SQL-запросы в dev (npm run dev).
// Можно принудительно включить/выключить через PRISMA_LOG_QUERIES.
const shouldLogQueries =
	process.env.PRISMA_LOG_QUERIES !== undefined
		? isTruthyEnv(process.env.PRISMA_LOG_QUERIES)
		: config.NODE_ENV === "development";

export const prisma = new PrismaClient({
	log: [
		...(shouldLogQueries ? ([{ emit: "event", level: "query" }] as const) : []),
		{ emit: "stdout", level: "warn" },
		{ emit: "stdout", level: "error" }
	]
});

if (shouldLogQueries) {
	prisma.$on("query", (event: Prisma.QueryEvent) => {
		const queryOneLine = event.query.replace(/\s+/g, " ").trim();

		// eslint-disable-next-line no-console
		console.log(`[prisma] ${event.duration}ms ${event.target}`);
		// eslint-disable-next-line no-console
		console.log(`  ${queryOneLine}`);

		const params = event.params?.trim();
		if (params && params !== "[]" && params !== "{}") {
			// eslint-disable-next-line no-console
			console.log(`  params: ${params}`);
		}
	});
}
