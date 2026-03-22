import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { writeServerLog } from "@/lib/server-log";

const deleteInputSchema = z.object({
  id: z.string().min(1),
});

function isMissingHistoryTableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022")
  );
}

function isRecordMissingError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
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

export async function POST(request: Request) {
  const traceId = randomUUID();

  try {
    const body = await request.json();
    const parsed = deleteInputSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid delete request.";
      await writeServerLog("api/history/delete", `Validation failed trace=${traceId}: ${message}`);
      return NextResponse.json({ ok: false, error: message, traceId }, { status: 400 });
    }

    try {
      await prisma.history.delete({
        where: {
          id: parsed.data.id,
        },
      });
    } catch (error) {
      if (isMissingHistoryTableError(error)) {
        await ensureHistoryTableExists();
      } else if (!isRecordMissingError(error)) {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await writeServerLog("api/history/delete", `Unhandled delete failure trace=${traceId}`, error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const publicError = process.env.NODE_ENV === "development"
      ? message
      : `Internal Server Error (trace: ${traceId})`;

    return NextResponse.json({ ok: false, error: publicError, traceId }, { status: 500 });
  }
}
