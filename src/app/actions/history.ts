"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  CodeFormat,
  DataType,
  HistoryItem,
  HistoryPage,
  HistoryQuery,
  HistorySortOrder,
} from "@/lib/types";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORY_PAYLOAD_CHARS = 3000;
const MAX_HISTORY_PAYLOAD_BYTES = 1200;
const STORAGE_ESCAPE_PREFIX = "esc:v1:";
const allowedDataTypes = ["url", "text", "vcard", "wifi", "email", "sms", "geo", "event", "crypto"] as const;
const allowedFormats = ["qr", "barcode"] as const;

const saveHistoryInputSchema = z
  .object({
    type: z.enum(allowedDataTypes),
    format: z.enum(allowedFormats),
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

    if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value.payload)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "Payload contains unsupported control characters",
      });
    }
  });

function escapePayloadForStorage(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const encoded = Buffer.from(normalized, "utf8").toString("base64");
  return `${STORAGE_ESCAPE_PREFIX}${encoded}`;
}

function unescapePayloadFromStorage(value: string): string {
  if (!value.startsWith(STORAGE_ESCAPE_PREFIX)) {
    return value;
  }

  const encoded = value.slice(STORAGE_ESCAPE_PREFIX.length);

  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return value;
  }
}

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

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return fallback;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

function normalizeDateRange(query: HistoryQuery): { dateFrom: Date; dateTo: Date } {
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

function toSafeHistoryPage(query?: Partial<HistoryQuery>): HistoryPage {
  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.max(1, Math.min(50, query?.pageSize ?? DEFAULT_PAGE_SIZE));
  const sortOrder: HistorySortOrder = query?.sortOrder === "oldest" ? "oldest" : "newest";

  const normalizedQuery: HistoryQuery = {
    page,
    pageSize,
    sortOrder,
    dateFrom: query?.dateFrom,
    dateTo: query?.dateTo,
  };

  const { dateFrom, dateTo } = normalizeDateRange(normalizedQuery);

  return {
    items: [],
    totalCount: 0,
    totalPages: 1,
    page: 1,
    pageSize,
    sortOrder,
    dateFrom: serializeDateOnly(dateFrom),
    dateTo: serializeDateOnly(dateTo),
  };
}

function isMissingHistoryTableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("database is locked") || message.includes("sqlite_busy");
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function saveHistoryRecord(input: { type: DataType; format: CodeFormat; payload: string }): Promise<void> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.history.create({
        data: {
          type: input.type,
          format: input.format,
          payload: input.payload,
        },
      });
      return;
    } catch (error) {
      if (isMissingHistoryTableError(error)) {
        await ensureHistoryTableExists();
      } else if (isSqliteBusyError(error) && attempt < maxAttempts) {
        await sleep(120 * attempt);
      } else {
        throw error;
      }
    }
  }
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

interface SaveHistoryInput {
  type: DataType;
  format: CodeFormat;
  payload: string;
}

function mapHistoryRows(rows: Array<{ id: string; type: string; format: string; payload: string; createdAt: Date }>): HistoryItem[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type as DataType,
    format: row.format as CodeFormat,
    payload: unescapePayloadFromStorage(row.payload),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function ensureHistoryRetentionAction(): Promise<void> {
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
}

export async function getHistoryAction(query?: Partial<HistoryQuery>): Promise<HistoryPage> {
  try {
    await ensureHistoryRetentionAction();

    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.max(1, Math.min(50, query?.pageSize ?? DEFAULT_PAGE_SIZE));
    const sortOrder: HistorySortOrder = query?.sortOrder === "oldest" ? "oldest" : "newest";

    const normalizedQuery: HistoryQuery = {
      page,
      pageSize,
      sortOrder,
      dateFrom: query?.dateFrom,
      dateTo: query?.dateTo,
    };

    const { dateFrom, dateTo } = normalizeDateRange(normalizedQuery);
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

      return {
        items: [],
        totalCount: 0,
        totalPages: 1,
        page: 1,
        pageSize,
        sortOrder,
        dateFrom: serializeDateOnly(dateFrom),
        dateTo: serializeDateOnly(dateTo),
      };
    }
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);

    let rows: Array<{ id: string; type: string; format: string; payload: string; createdAt: Date }> = [];

    try {
      rows = await prisma.history.findMany({
        where,
        orderBy: { createdAt: sortOrder === "newest" ? "desc" : "asc" },
        skip: (safePage - 1) * pageSize,
        take: pageSize,
      });
    } catch (error) {
      if (!isMissingHistoryTableError(error)) {
        throw error;
      }
    }

    return {
      items: mapHistoryRows(rows),
      totalCount,
      totalPages,
      page: safePage,
      pageSize,
      sortOrder,
      dateFrom: serializeDateOnly(dateFrom),
      dateTo: serializeDateOnly(dateTo),
    };
  } catch (error) {
    console.error("[Qrohl][History] Failed to read history:", error);
    return toSafeHistoryPage(query);
  }
}

export async function saveHistoryAction(
  input: SaveHistoryInput,
  query?: Partial<HistoryQuery>,
): Promise<HistoryPage> {
  try {
    const parsed = saveHistoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return getHistoryAction(query);
    }

    const payload = escapePayloadForStorage(parsed.data.payload.trim());

    if (!payload) {
      return getHistoryAction(query);
    }

    await saveHistoryRecord({
      type: parsed.data.type,
      format: parsed.data.format,
      payload,
    });

    try {
      await ensureHistoryRetentionAction();
    } catch (retentionError) {
      console.error("[Qrohl][History] Retention cleanup failed after save:", retentionError);
    }

    return getHistoryAction(query);
  } catch (error) {
    console.error("[Qrohl][History] Failed to save history:", error);
    return toSafeHistoryPage(query);
  }
}
