import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { writeServerLog } from "@/lib/server-log";
import type { HistoryPage, HistoryQuery, HistorySortOrder } from "@/lib/types";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORY_PAYLOAD_CHARS = 3000;
const MAX_HISTORY_PAYLOAD_BYTES = 1200;
const STORAGE_ESCAPE_PREFIX = "esc:v1:";

const saveInputSchema = z
  .object({
    type: z.enum(["url", "text", "vcard", "wifi", "email", "sms", "geo", "event", "crypto"]),
    format: z.enum(["qr", "barcode"]),
    payload: z.string().trim().min(1).max(MAX_HISTORY_PAYLOAD_CHARS),
  })
  .superRefine((value, context) => {
    const payloadByteLength = new TextEncoder().encode(value.payload).length;

    if (payloadByteLength > MAX_HISTORY_PAYLOAD_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: `Payload exceeds ${MAX_HISTORY_PAYLOAD_BYTES} bytes`,
      });
    }

    if (value.format === "barcode" && value.type !== "text") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["format"],
        message: "Barcode format is only allowed for text data",
      });
    }
  });

const querySchema = z
  .object({
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
    sortOrder: z.enum(["newest", "oldest"]).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })
  .optional();

function getSixtyDaysAgo(): Date {
  return new Date(Date.now() - SIXTY_DAYS_MS);
}

function normalizeDateInput(rawValue: string | undefined, fallback: Date): Date {
  if (!rawValue) {
    return fallback;
  }

  const [yearText, monthText, dayText] = rawValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return fallback;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeDateRange(query: Partial<HistoryQuery>) {
  const now = new Date();
  const sixtyDaysAgo = getSixtyDaysAgo();

  const requestedFrom = normalizeDateInput(query.dateFrom, sixtyDaysAgo);
  const requestedToBase = normalizeDateInput(query.dateTo, now);
  const requestedTo = new Date(requestedToBase);
  requestedTo.setHours(23, 59, 59, 999);

  let dateFrom = requestedFrom < sixtyDaysAgo ? sixtyDaysAgo : requestedFrom;
  const dateTo = requestedTo > now ? now : requestedTo;

  if (dateFrom > dateTo) {
    dateFrom = new Date(dateTo);
  }

  return { dateFrom, dateTo };
}

function serializeDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapePayloadForStorage(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const encoded = Buffer.from(normalized, "utf8").toString("base64");
  return `${STORAGE_ESCAPE_PREFIX}${encoded}`;
}

function unescapePayloadFromStorage(value: string): string {
  if (!value.startsWith(STORAGE_ESCAPE_PREFIX)) {
    return value;
  }

  try {
    return Buffer.from(value.slice(STORAGE_ESCAPE_PREFIX.length), "base64").toString("utf8");
  } catch {
    return value;
  }
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("database is locked") || message.includes("sqlite_busy");
}

function isMissingHistoryTableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022")
  );
}

async function ensureHistoryTableExists(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "History" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "format" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "History_createdAt_idx" ON "History"("createdAt");
  `);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function buildHistoryPage(query: Partial<HistoryQuery>): Promise<HistoryPage> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const sortOrder: HistorySortOrder = query.sortOrder === "oldest" ? "oldest" : "newest";

  const { dateFrom, dateTo } = normalizeDateRange(query);
  const where = {
    createdAt: {
      gte: dateFrom,
      lte: dateTo,
    },
  };

  let totalCount = 0;

  try {
    totalCount = await prisma.history.count({ where });
  } catch (error) {
    if (!isMissingHistoryTableError(error)) {
      throw error;
    }

    await ensureHistoryTableExists();
    totalCount = await prisma.history.count({ where });
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  let rows = await prisma.history.findMany({
    where,
    orderBy: { createdAt: sortOrder === "newest" ? "desc" : "asc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
  });

  if (!rows) {
    rows = [];
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type as HistoryPage["items"][number]["type"],
      format: row.format as HistoryPage["items"][number]["format"],
      payload: unescapePayloadFromStorage(row.payload),
      createdAt: row.createdAt.toISOString(),
    })),
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
    sortOrder,
    dateFrom: serializeDateOnly(dateFrom),
    dateTo: serializeDateOnly(dateTo),
  };
}

export async function POST(request: Request) {
  const traceId = randomUUID();

  try {
    const body = await request.json();
    const parsedInput = saveInputSchema.safeParse(body?.input);
    if (!parsedInput.success) {
      const message = parsedInput.error.issues[0]?.message ?? "Invalid save payload.";
      await writeServerLog("api/history/save", `Validation failed trace=${traceId}: ${message}`);
      return NextResponse.json({ ok: false, error: message, traceId }, { status: 400 });
    }

    const parsedQuery = querySchema.safeParse(body?.query);
    const safeQuery: Partial<HistoryQuery> = parsedQuery.success ? (parsedQuery.data ?? {}) : {};

    try {
      await prisma.history.deleteMany({
        where: {
          createdAt: {
            lt: getSixtyDaysAgo(),
          },
        },
      });
    } catch (error) {
      if (!isMissingHistoryTableError(error)) {
        throw error;
      }

      await ensureHistoryTableExists();
    }

    const payload = escapePayloadForStorage(parsedInput.data.payload.trim());

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await prisma.history.create({
          data: {
            type: parsedInput.data.type,
            format: parsedInput.data.format,
            payload,
          },
        });
        break;
      } catch (error) {
        if (isMissingHistoryTableError(error)) {
          await ensureHistoryTableExists();
          continue;
        }

        if (isSqliteBusyError(error) && attempt < maxAttempts) {
          await sleep(120 * attempt);
          continue;
        }
        throw error;
      }
    }

    const page = await buildHistoryPage({
      ...safeQuery,
      page: 1,
    });

    return NextResponse.json({ ok: true, page });
  } catch (error) {
    await writeServerLog("api/history/save", `Unhandled save failure trace=${traceId}`, error);
    console.error(`[Qrohl][API] Save history failed (trace=${traceId}):`, error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const publicError = process.env.NODE_ENV === "development"
      ? message
      : `Internal Server Error (trace: ${traceId})`;
    return NextResponse.json({ ok: false, error: publicError, traceId }, { status: 500 });
  }
}
