"use client";

import Image from "next/image";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Barcode from "react-barcode";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  CalendarDays,
  Download,
  History as HistoryIcon,
  LoaderCircle,
  Save,
  Trash2,
  Wifi,
} from "lucide-react";

import { getHistoryAction } from "@/app/actions/history";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomNotification, type CustomNotificationItem } from "@/components/ui/custom-notification";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadPngFromCanvas, downloadPngFromSvg, downloadSvg } from "@/lib/download";
import {
  buildPayload,
  dataTypeLabels,
  defaultValues,
  parsePayloadToValues,
  validateForType,
} from "@/lib/generator";
import type {
  CodeFormat,
  DataType,
  GeneratorValues,
  HistoryPage,
  HistoryQuery,
  HistorySortOrder,
  HistoryItem,
} from "@/lib/types";

const dataTypes: DataType[] = [
  "url",
  "text",
  "vcard",
  "wifi",
  "email",
  "sms",
  "geo",
  "event",
  "crypto",
];

const MAX_QR_PAYLOAD_BYTES = 1200;

const fieldMaxLengths: Partial<Record<keyof GeneratorValues, number>> = {
  url: 120,              // Enough for most domains + short paths
  text: 200,             // Practical limit for quick readability
  firstName: 40,
  lastName: 40,
  phone: 15,             // Standard E.164 max is 15 digits
  contactEmail: 64,      // Common practical limit for emails
  company: 50,
  ssid: 32,              // Hardware limit
  wifiPassword: 63,      // Hardware limit
  emailTo: 64,
  emailSubject: 60,
  emailBody: 200,        // Optimized for fast scanning mailto links
  smsPhone: 15,
  smsBody: 160,          // Fits exactly one SMS segment
  latitude: 12,          // Precision to ~1.1mm (e.g., -90.1234567)
  longitude: 12,
  eventTitle: 50,
  eventLocation: 100,
  eventDescription: 200,
  eventStart: 20,        // ISO 8601 format
  eventEnd: 20,
  cryptoAddress: 64,     // Covers BTC, ETH, and most common chains
  cryptoAmount: 20,
  cryptoMemo: 60,
};

function formatDateLocal(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface GeneratorDashboardProps {
  initialHistory: HistoryPage;
}

interface SaveHistoryApiResponse {
  ok: boolean;
  page?: HistoryPage;
  error?: string;
}

interface DeleteHistoryApiResponse {
  ok: boolean;
  error?: string;
}

export function GeneratorDashboard({ initialHistory }: GeneratorDashboardProps) {
  const [activeType, setActiveType] = useState<DataType>("url");
  const [infoTab, setInfoTab] = useState<"wifi" | "event">("wifi");
  const [format, setFormat] = useState<CodeFormat>("qr");
  const [values, setValues] = useState<GeneratorValues>(defaultValues);
  const [history, setHistory] = useState<HistoryPage>(initialHistory);
  const [historyQuery, setHistoryQuery] = useState<HistoryQuery>({
    page: initialHistory.page,
    pageSize: initialHistory.pageSize,
    sortOrder: initialHistory.sortOrder,
    dateFrom: initialHistory.dateFrom,
    dateTo: initialHistory.dateTo,
  });
  const [loadedHistoryRecord, setLoadedHistoryRecord] = useState<{
    id: string;
    type: DataType;
    format: CodeFormat;
    values: GeneratorValues;
  } | null>(null);
  const [notifications, setNotifications] = useState<CustomNotificationItem[]>([]);
  const [isSaving, startSaving] = useTransition();

  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeContainerRef = useRef<HTMLDivElement>(null);
  const notificationIdRef = useRef(0);
  const notificationTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const validation = useMemo(() => validateForType(activeType, values), [activeType, values]);
  const livePayload = useMemo(() => buildPayload(activeType, values), [activeType, values]);
  const hasAnyInput = useMemo(() => JSON.stringify(values) !== JSON.stringify(defaultValues), [values]);

  const effectiveFormat: CodeFormat = activeType === "text" ? format : "qr";
  const payload = livePayload;
  const payloadByteLength = useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const isQrPayloadTooLong = effectiveFormat === "qr" && payloadByteLength > MAX_QR_PAYLOAD_BYTES;
  const canPreview = payload.length > 0 && validation.isValid && !isQrPayloadTooLong;
  const hasEditedLoadedRecord = useMemo(() => {
    if (!loadedHistoryRecord) {
      return false;
    }

    const hasTypeChange = activeType !== loadedHistoryRecord.type;
    const hasFormatChange = effectiveFormat !== loadedHistoryRecord.format;

    if (hasTypeChange || hasFormatChange) {
      return true;
    }

    return JSON.stringify(values) !== JSON.stringify(loadedHistoryRecord.values);
  }, [activeType, effectiveFormat, loadedHistoryRecord, values]);
  const dateLimits = useMemo(() => {
    const today = new Date();
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

    return {
      min: formatDateLocal(sixtyDaysAgo),
      max: formatDateLocal(today),
    };
  }, []);
  const isHistorySortingCleared = useMemo(
    () =>
      historyQuery.sortOrder === "newest" &&
      (historyQuery.dateFrom ?? dateLimits.min) === dateLimits.min &&
      (historyQuery.dateTo ?? dateLimits.max) === dateLimits.max,
    [dateLimits.max, dateLimits.min, historyQuery.dateFrom, historyQuery.dateTo, historyQuery.sortOrder]
  );

  useEffect(() => {
    return () => {
      notificationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      notificationTimeoutsRef.current.clear();
    };
  }, []);

  function dismissNotification(id: number) {
    const timeoutId = notificationTimeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      notificationTimeoutsRef.current.delete(id);
    }

    setNotifications((previous) => previous.filter((notification) => notification.id !== id));
  }

  function pushNotification(type: CustomNotificationItem["type"], text: string) {
    const id = notificationIdRef.current + 1;
    notificationIdRef.current = id;

    setNotifications((previous) => [{ id, type, text }, ...previous].slice(0, 4));

    const timeoutId = setTimeout(() => dismissNotification(id), 4500);
    notificationTimeoutsRef.current.set(id, timeoutId);
  }

  async function saveHistoryViaApi(payload: { type: DataType; format: CodeFormat; payload: string }) {
    const response = await fetch("/api/history/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: payload,
        query: {
          ...historyQuery,
          page: 1,
        },
      }),
    });

    const responseText = await response.text();
    let result: SaveHistoryApiResponse | null = null;

    try {
      result = JSON.parse(responseText) as SaveHistoryApiResponse;
    } catch {
      result = null;
    }

    if (!response.ok || !result?.ok || !result.page) {
      throw new Error(result?.error ?? (responseText || "Could not save this code. Please try again."));
    }

    return result.page;
  }

  async function deleteHistoryViaApi(id: string) {
    const response = await fetch("/api/history/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });

    const responseText = await response.text();
    let result: DeleteHistoryApiResponse | null = null;

    try {
      result = JSON.parse(responseText) as DeleteHistoryApiResponse;
    } catch {
      result = null;
    }

    if (!response.ok || !result?.ok) {
      throw new Error(result?.error ?? (responseText || "Could not delete this history item."));
    }
  }

  function syncHistoryPage(page: HistoryPage) {
    setHistory(page);
    setHistoryQuery({
      page: page.page,
      pageSize: page.pageSize,
      sortOrder: page.sortOrder,
      dateFrom: page.dateFrom,
      dateTo: page.dateTo,
    });
  }

  function fetchHistory(nextQuery: Partial<HistoryQuery>) {
    startSaving(async () => {
      try {
        const rows = await getHistoryAction({
          ...historyQuery,
          ...nextQuery,
        });
        syncHistoryPage(rows);
      } catch (error) {
        console.error("[Qrohl][UI] Failed to load history:", error);
        pushNotification("error", "Could not load history. Please try again.");
      }
    });
  }

  function setField<K extends keyof GeneratorValues>(field: K, value: GeneratorValues[K]) {
    const maxLength = fieldMaxLengths[field];
    const normalizedValue =
      typeof value === "string" && maxLength ? ((value as string).slice(0, maxLength) as GeneratorValues[K]) : value;

    setValues((previous) => ({
      ...previous,
      [field]: normalizedValue,
    }));
  }

  function getInputFieldProps<K extends keyof GeneratorValues>(field: K) {
    return {
      value: values[field],
      maxLength: fieldMaxLengths[field],
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setField(field, event.target.value as GeneratorValues[K]),
    };
  }

  function onTabChange(nextType: string) {
    setActiveType(nextType as DataType);
    setLoadedHistoryRecord(null);
    if (nextType === "wifi" || nextType === "event") {
      setInfoTab(nextType);
    }
    if (nextType !== "text") {
      setFormat("qr");
    }
  }

  function onDownloadSvg() {
    if (!canPreview) {
      return;
    }

    try {
      if (effectiveFormat === "qr") {
        const svg = qrContainerRef.current?.querySelector("svg");
        if (!svg) {
          throw new Error("SVG export failed. Please try again.");
        }

        downloadSvg(svg, `${activeType}-code.svg`);
        pushNotification("success", "SVG exported successfully.");
        return;
      }

      const barcodeSvg = barcodeContainerRef.current?.querySelector("svg");
      if (!barcodeSvg) {
        throw new Error("SVG export failed. Please try again.");
      }

      downloadSvg(barcodeSvg, `${activeType}-barcode.svg`);
      pushNotification("success", "SVG exported successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG export failed. Please try again.";
      pushNotification("error", message);
    }
  }

  async function onDownloadPng() {
    if (!canPreview) {
      return;
    }

    try {
      if (effectiveFormat === "qr") {
        const canvas = qrCanvasRef.current;
        if (!canvas) {
          throw new Error("PNG export failed. Please try again.");
        }

        downloadPngFromCanvas(canvas, `${activeType}-code.png`);
        pushNotification("success", "PNG exported successfully.");
        return;
      }

      const barcodeSvg = barcodeContainerRef.current?.querySelector("svg");
      if (!barcodeSvg) {
        throw new Error("PNG export failed. Please try again.");
      }

      await downloadPngFromSvg(barcodeSvg, `${activeType}-barcode.png`);
      pushNotification("success", "PNG exported successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "PNG export failed. Please try again.";
      pushNotification("error", message);
    }
  }

  function onSaveToHistory() {
    if (!validation.isValid || !livePayload.trim() || isQrPayloadTooLong || loadedHistoryRecord !== null) {
      return;
    }

    const payloadToSave = livePayload;
    const typeToSave = activeType;
    const formatToSave = effectiveFormat;

    setValues(defaultValues);
    setLoadedHistoryRecord(null);

    startSaving(async () => {
      try {
        const updatedHistory = await saveHistoryViaApi({
          type: typeToSave,
          format: formatToSave,
          payload: payloadToSave,
        });
        pushNotification("success", "Saved successfully.");
        syncHistoryPage(updatedHistory);
      } catch (error) {
        console.error("[Qrohl][UI] Failed to save history:", error);
        const message = error instanceof Error ? error.message : "Could not save this code. Please try again.";
        pushNotification("error", message);
      }
    });
  }

  function onSaveEditedHistory() {
    if (!loadedHistoryRecord || !hasEditedLoadedRecord || !validation.isValid || !livePayload.trim() || isQrPayloadTooLong) {
      return;
    }

    const payloadToSave = livePayload;
    const typeToSave = activeType;
    const formatToSave = effectiveFormat;

    setValues(defaultValues);
    setLoadedHistoryRecord(null);

    startSaving(async () => {
      try {
        const updatedHistory = await saveHistoryViaApi({
          type: typeToSave,
          format: formatToSave,
          payload: payloadToSave,
        });
        pushNotification("success", "The edited entry has been saved as a new record.");
        syncHistoryPage(updatedHistory);
      } catch (error) {
        console.error("[Qrohl][UI] Failed to save edited history:", error);
        const message = error instanceof Error ? error.message : "Could not save this edited code. Please try again.";
        pushNotification("error", message);
      }
    });
  }

  function onLoadHistory(item: HistoryItem) {
    setActiveType(item.type);
    setFormat(item.type === "text" ? item.format : "qr");
    const parsedValues = parsePayloadToValues(item.type, item.payload);
    setValues(parsedValues);
    setLoadedHistoryRecord({
      id: item.id,
      type: item.type,
      format: item.type === "text" ? item.format : "qr",
      values: parsedValues,
    });
    pushNotification("info", "History item loaded for editing.");
  }

  function onRefreshHistory() {
    fetchHistory({ page: historyQuery.page });
  }

  function onClearInputs() {
    setValues(defaultValues);
    setLoadedHistoryRecord(null);
    pushNotification("success", "All input fields have been cleared.");
  }

  function onDeleteHistory(itemId: string) {
    startSaving(async () => {
      try {
        await deleteHistoryViaApi(itemId);
        const nextPage = history.items.length === 1 && history.page > 1 ? history.page - 1 : history.page;
        const refreshed = await getHistoryAction({
          ...historyQuery,
          page: nextPage,
        });
        pushNotification("success", "History item deleted.");
        syncHistoryPage(refreshed);
      } catch (error) {
        console.error("[Qrohl][UI] Failed to delete history item:", error);
        const message = error instanceof Error ? error.message : "Could not delete this history item.";
        pushNotification("error", message);
      }
    });
  }

  function onSortChange(value: string | null) {
    if (!value) {
      return;
    }

    fetchHistory({
      page: 1,
      sortOrder: value as HistorySortOrder,
    });
  }

  function onDateChange(field: "dateFrom" | "dateTo", value: string) {
    fetchHistory({
      page: 1,
      [field]: value,
    });
  }

  function onPageChange(direction: "prev" | "next") {
    const nextPage = direction === "prev" ? history.page - 1 : history.page + 1;
    fetchHistory({ page: nextPage });
  }

  function onClearSorting() {
    fetchHistory({
      page: 1,
      sortOrder: "newest",
      dateFrom: dateLimits.min,
      dateTo: dateLimits.max,
    });
    pushNotification("success", "History sorting has been cleared.");
  }

  function renderFieldError(field: keyof GeneratorValues) {
    const error = validation.errors[field];
    if (!error) {
      return null;
    }

    return <FormMessage>{error}</FormMessage>;
  }

  function renderRemainingChars(field: keyof GeneratorValues) {
    const maxLength = fieldMaxLengths[field];
    if (!maxLength) {
      return null;
    }

    const currentLength = values[field].length;
    return <p className="text-xs text-muted-foreground">{Math.max(maxLength - currentLength, 0)} characters remaining</p>;
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 text-sm leading-relaxed md:px-8">
      <CustomNotification notifications={notifications} onDismiss={dismissNotification} />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Image src="/icon.svg" alt="Qrohl logo" width={100} height={100} className="rounded-md" priority />
            <div>
              <CardTitle className="text-5xl font-semibold tracking-tight">Qrohl</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                The Whole Package for QR and Barcodes.
              </CardDescription>
            </div>
          </div>
          <CardDescription className="pt-2 text-sm leading-relaxed">
            Generate QR data formats and standard 1D barcodes with live preview and downloads.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeType} onValueChange={onTabChange}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              {dataTypes.map((type) => (
                <TabsTrigger
                  key={type}
                  value={type}
                  className="h-8 flex-none border border-border px-3 text-[13px]"
                >
                  {dataTypeLabels[type]}
                </TabsTrigger>
              ))}
            </TabsList>

            {dataTypes.map((type) => (
              <TabsContent key={type} value={type} className="mt-4">
                <Form className="max-w-3xl">
                  {type === "url" && (
                    <FormItem>
                      <Label htmlFor="url">Website URL</Label>
                      <Input
                        id="url"
                        placeholder="https://example.com"
                        {...getInputFieldProps("url")}
                      />
                      {renderFieldError("url")}
                      {renderRemainingChars("url")}
                    </FormItem>
                  )}

                  {type === "text" && (
                    <FormItem>
                      <Label htmlFor="text">Plain Text</Label>
                      <Input
                        id="text"
                        placeholder="Enter any text"
                        {...getInputFieldProps("text")}
                      />
                      {renderFieldError("text")}
                      {renderRemainingChars("text")}
                    </FormItem>
                  )}

                  {type === "vcard" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormItem>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          {...getInputFieldProps("firstName")}
                        />
                        {renderFieldError("firstName")}
                        {renderRemainingChars("firstName")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          {...getInputFieldProps("lastName")}
                        />
                        {renderFieldError("lastName")}
                        {renderRemainingChars("lastName")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          {...getInputFieldProps("phone")}
                        />
                        {renderFieldError("phone")}
                        {renderRemainingChars("phone")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="contactEmail">Email</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          {...getInputFieldProps("contactEmail")}
                        />
                        {renderFieldError("contactEmail")}
                        {renderRemainingChars("contactEmail")}
                      </FormItem>
                      <FormItem className="md:col-span-2">
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          {...getInputFieldProps("company")}
                        />
                        {renderFieldError("company")}
                        {renderRemainingChars("company")}
                      </FormItem>
                    </div>
                  )}

                  {type === "wifi" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormItem className="md:col-span-2">
                        <Label htmlFor="ssid">SSID</Label>
                        <Input
                          id="ssid"
                          {...getInputFieldProps("ssid")}
                        />
                        {renderFieldError("ssid")}
                        {renderRemainingChars("ssid")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="wifiPassword">Password</Label>
                        <Input
                          id="wifiPassword"
                          type="password"
                          {...getInputFieldProps("wifiPassword")}
                        />
                        {renderFieldError("wifiPassword")}
                        {renderRemainingChars("wifiPassword")}
                      </FormItem>
                      <FormItem>
                        <Label>Encryption</Label>
                        <Select
                          value={values.encryption}
                          onValueChange={(value) => setField("encryption", value as GeneratorValues["encryption"])}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select encryption" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WPA">WPA/WPA2</SelectItem>
                            <SelectItem value="WEP">WEP</SelectItem>
                            <SelectItem value="nopass">Open</SelectItem>
                          </SelectContent>
                        </Select>
                        {renderFieldError("encryption")}
                      </FormItem>
                      <FormItem>
                        <Label>Hidden Network</Label>
                        <Select
                          value={values.hidden}
                          onValueChange={(value) => setField("hidden", value as GeneratorValues["hidden"])}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">No</SelectItem>
                            <SelectItem value="true">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                        {renderFieldError("hidden")}
                      </FormItem>
                    </div>
                  )}

                  {type === "email" && (
                    <div className="grid gap-3">
                      <FormItem>
                        <Label htmlFor="emailTo">Recipient Email</Label>
                        <Input
                          id="emailTo"
                          type="email"
                          {...getInputFieldProps("emailTo")}
                        />
                        {renderFieldError("emailTo")}
                        {renderRemainingChars("emailTo")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="emailSubject">Subject</Label>
                        <Input
                          id="emailSubject"
                          {...getInputFieldProps("emailSubject")}
                        />
                        {renderFieldError("emailSubject")}
                        {renderRemainingChars("emailSubject")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="emailBody">Body</Label>
                        <Input
                          id="emailBody"
                          {...getInputFieldProps("emailBody")}
                        />
                        {renderFieldError("emailBody")}
                        {renderRemainingChars("emailBody")}
                      </FormItem>
                    </div>
                  )}

                  {type === "sms" && (
                    <div className="grid gap-3">
                      <FormItem>
                        <Label htmlFor="smsPhone">Phone Number</Label>
                        <Input
                          id="smsPhone"
                          {...getInputFieldProps("smsPhone")}
                        />
                        {renderFieldError("smsPhone")}
                        {renderRemainingChars("smsPhone")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="smsBody">Message</Label>
                        <Input
                          id="smsBody"
                          {...getInputFieldProps("smsBody")}
                        />
                        {renderFieldError("smsBody")}
                        {renderRemainingChars("smsBody")}
                      </FormItem>
                    </div>
                  )}

                  {type === "geo" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormItem>
                        <Label htmlFor="latitude">Latitude</Label>
                        <Input
                          id="latitude"
                          placeholder="37.422"
                          {...getInputFieldProps("latitude")}
                        />
                        {renderFieldError("latitude")}
                        {renderRemainingChars("latitude")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="longitude">Longitude</Label>
                        <Input
                          id="longitude"
                          placeholder="-122.084"
                          {...getInputFieldProps("longitude")}
                        />
                        {renderFieldError("longitude")}
                        {renderRemainingChars("longitude")}
                      </FormItem>
                    </div>
                  )}

                  {type === "event" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormItem className="md:col-span-2">
                        <Label htmlFor="eventTitle">Event Title</Label>
                        <Input
                          id="eventTitle"
                          {...getInputFieldProps("eventTitle")}
                        />
                        {renderFieldError("eventTitle")}
                        {renderRemainingChars("eventTitle")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="eventLocation">Location</Label>
                        <Input
                          id="eventLocation"
                          {...getInputFieldProps("eventLocation")}
                        />
                        {renderFieldError("eventLocation")}
                        {renderRemainingChars("eventLocation")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="eventDescription">Description</Label>
                        <Input
                          id="eventDescription"
                          {...getInputFieldProps("eventDescription")}
                        />
                        {renderFieldError("eventDescription")}
                        {renderRemainingChars("eventDescription")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="eventStart">Start Date & Time</Label>
                        <Input
                          id="eventStart"
                          type="datetime-local"
                          {...getInputFieldProps("eventStart")}
                        />
                        {renderFieldError("eventStart")}
                        {renderRemainingChars("eventStart")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="eventEnd">End Date & Time</Label>
                        <Input
                          id="eventEnd"
                          type="datetime-local"
                          {...getInputFieldProps("eventEnd")}
                        />
                        {renderFieldError("eventEnd")}
                        {renderRemainingChars("eventEnd")}
                      </FormItem>
                    </div>
                  )}

                  {type === "crypto" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormItem>
                        <Label>Crypto Type</Label>
                        <Select
                          value={values.cryptoType}
                          onValueChange={(value) => setField("cryptoType", value as GeneratorValues["cryptoType"])}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select crypto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bitcoin">Bitcoin</SelectItem>
                            <SelectItem value="ethereum">Ethereum</SelectItem>
                            <SelectItem value="litecoin">Litecoin</SelectItem>
                          </SelectContent>
                        </Select>
                        {renderFieldError("cryptoType")}
                      </FormItem>
                      <FormItem className="md:col-span-2">
                        <Label htmlFor="cryptoAddress">Wallet Address</Label>
                        <Input
                          id="cryptoAddress"
                          {...getInputFieldProps("cryptoAddress")}
                        />
                        {renderFieldError("cryptoAddress")}
                        {renderRemainingChars("cryptoAddress")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="cryptoAmount">Amount (optional)</Label>
                        <Input
                          id="cryptoAmount"
                          {...getInputFieldProps("cryptoAmount")}
                        />
                        {renderFieldError("cryptoAmount")}
                        {renderRemainingChars("cryptoAmount")}
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="cryptoMemo">Memo (optional)</Label>
                        <Input
                          id="cryptoMemo"
                          {...getInputFieldProps("cryptoMemo")}
                        />
                        {renderRemainingChars("cryptoMemo")}
                      </FormItem>
                    </div>
                  )}
                </Form>

              </TabsContent>
            ))}
          </Tabs>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant={effectiveFormat === "qr" ? "default" : "outline"}
              onClick={() => setFormat("qr")}
            >
              QR Code
            </Button>
            <Button
              variant={effectiveFormat === "barcode" ? "default" : "outline"}
              disabled={activeType !== "text"}
              onClick={() => setFormat("barcode")}
            >
              Barcode
            </Button>
            {activeType !== "text" && (
              <p className="text-xs text-muted-foreground">Barcode is available only for Plain Text.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onClearInputs} disabled={!hasAnyInput && !loadedHistoryRecord}>
              Clear Inputs
            </Button>
            <Button variant="outline" onClick={onDownloadSvg} disabled={!canPreview}>
              <Download /> SVG
            </Button>
            <Button variant="outline" onClick={onDownloadPng} disabled={!canPreview}>
              <Download /> PNG
            </Button>
            <Button onClick={onSaveToHistory} disabled={!validation.isValid || !livePayload || isSaving || isQrPayloadTooLong || loadedHistoryRecord !== null}>
              {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />} Save
            </Button>
            <Button
              variant="outline"
              onClick={onSaveEditedHistory}
              disabled={!loadedHistoryRecord || !hasEditedLoadedRecord || !validation.isValid || !livePayload || isSaving || isQrPayloadTooLong}
            >
              {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />} Edit & Save as New
            </Button>
          </div>
          {isQrPayloadTooLong && (
            <p className="w-full text-xs text-destructive">
              Data too long for QR level H (currently {payloadByteLength} bytes, max {MAX_QR_PAYLOAD_BYTES}). For fastest scanning, keep data around 100–200 characters.
            </p>
          )}
        </CardFooter>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Live Preview</CardTitle>
            <CardDescription>Updates in real-time as you type.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-72 items-center justify-center">
            {!canPreview && (
              <p className="text-sm text-muted-foreground">
                {isQrPayloadTooLong ? "Data is too long for QR preview. Reduce input length and aim for 100–200 characters for instant scanning on most phones." : "Fill the form to generate a code."}
              </p>
            )}

            {canPreview && effectiveFormat === "qr" && (
              <div className="space-y-3 text-center">
                <div ref={qrContainerRef} className="rounded-lg border bg-white p-4">
                  <QRCodeSVG value={payload} size={260} includeMargin level="H" />
                </div>
                <QRCodeCanvas
                  value={payload}
                  size={1024}
                  includeMargin
                  level="H"
                  className="hidden"
                  ref={qrCanvasRef}
                />
                <p className="text-xs text-muted-foreground">Format: QR Code</p>
              </div>
            )}

            {canPreview && effectiveFormat === "barcode" && (
              <div ref={barcodeContainerRef} className="space-y-3 text-center">
                <div className="rounded-lg border bg-white p-4">
                  <Barcode
                    value={payload}
                    width={2}
                    height={100}
                    displayValue
                    margin={0}
                    background="#ffffff"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Format: Barcode</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <HistoryIcon className="size-4" />
              Generation History
            </CardTitle>
            <CardDescription>Click any item to reload it into preview.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2">
              <div className="grid gap-2 md:grid-cols-2">
                <FormItem>
                  <Label htmlFor="historySort">Sort</Label>
                  <Select value={historyQuery.sortOrder} onValueChange={onSortChange}>
                    <SelectTrigger id="historySort" className="h-9 w-full">
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <Label htmlFor="historyFrom">From</Label>
                  <Input
                    id="historyFrom"
                    type="date"
                    min={dateLimits.min}
                    max={dateLimits.max}
                    value={historyQuery.dateFrom ?? dateLimits.min}
                    onChange={(event) => onDateChange("dateFrom", event.target.value)}
                  />
                </FormItem>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <FormItem>
                  <Label htmlFor="historyTo">To</Label>
                  <Input
                    id="historyTo"
                    type="date"
                    min={dateLimits.min}
                    max={dateLimits.max}
                    value={historyQuery.dateTo ?? dateLimits.max}
                    onChange={(event) => onDateChange("dateTo", event.target.value)}
                  />
                </FormItem>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={onRefreshHistory} disabled={isSaving}>
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClearSorting}
                    disabled={isSaving || isHistorySortingCleared}
                    className="ml-2"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {history.items.length === 0 && (
              <p className="text-sm text-muted-foreground">No saved items yet.</p>
            )}

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {history.items.map((item) => (
                <div
                  key={item.id}
                  className="w-full rounded-lg border p-2 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <button
                      className="flex-1 text-left hover:bg-muted rounded-md p-1"
                      onClick={() => onLoadHistory(item)}
                      type="button"
                    >
                      <p className="font-medium">
                        {dataTypeLabels[item.type]} • {item.format.toUpperCase()}
                      </p>
                      <p className="line-clamp-2 text-muted-foreground">{item.payload}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true,
                        })}
                      </p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="mt-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteHistory(item.id)}
                      aria-label="Delete history item"
                      disabled={isSaving}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <p>
                Page {history.page} of {history.totalPages} • {history.totalCount} items
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange("prev")}
                  disabled={isSaving || history.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange("next")}
                  disabled={isSaving || history.page >= history.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(activeType === "wifi" || activeType === "event") && (
        <Card size="sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Important Things</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            How these special QR formats work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 py-3 text-sm leading-relaxed text-muted-foreground">
          <Tabs value={infoTab} onValueChange={(value) => setInfoTab(value as "wifi" | "event")} className="w-full">
            <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="wifi" className="h-8 border border-border px-3 text-sm">
                Wi-Fi QR
              </TabsTrigger>
              <TabsTrigger value="event" className="h-8 border border-border px-3 text-sm">
                Event QR
              </TabsTrigger>
            </TabsList>

            <TabsContent value="wifi" className="mt-3">
              <details open className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                  <Wifi className="size-4" />
                  How Wi-Fi QR works
                </summary>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Wi-Fi QR uses a standard text format like <code>WIFI:T:WPA;S:MyNetwork;P:MyPassword;;</code>.
                  </p>
                  <p>
                    Here, <strong>T</strong> is encryption type, <strong>S</strong> is SSID (network name), and <strong>P</strong> is password.
                  </p>
                </div>
              </details>
            </TabsContent>

            <TabsContent value="event" className="mt-3">
              <details open className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                  <CalendarDays className="size-4" />
                  How Event QR works
                </summary>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Event QR uses vCalendar (ICS), which calendar apps understand as a ready-to-save event.
                  </p>
                  <p>The app builds this format automatically from the Event form fields.</p>
                </div>
              </details>
            </TabsContent>
          </Tabs>

          <p className="text-sm">For best scan speed, keep data under 100–200 characters. This helps QR codes scan instantly on almost any smartphone camera.</p>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
