import { z } from "zod";

import type { DataType, GeneratorValues } from "@/lib/types";

const emailSchema = z.string().email("Must be a valid email");

export const defaultValues: GeneratorValues = {
	url: "",
	text: "",
	firstName: "",
	lastName: "",
	phone: "",
	contactEmail: "",
	company: "",
	ssid: "",
	wifiPassword: "",
	encryption: "WPA",
	hidden: "false",
	emailTo: "",
	emailSubject: "",
	emailBody: "",
	smsPhone: "",
	smsBody: "",
	latitude: "",
	longitude: "",
	eventTitle: "",
	eventLocation: "",
	eventDescription: "",
	eventStart: "",
	eventEnd: "",
	cryptoType: "bitcoin",
	cryptoAddress: "",
	cryptoAmount: "",
	cryptoMemo: "",
};

const schemas: Record<DataType, z.ZodType<unknown>> = {
	url: z.object({
		url: z.string().url("Must be a valid URL"),
	}),
	text: z.object({
		text: z.string().min(1, "Text is required"),
	}),
	vcard: z.object({
		firstName: z.string().min(1, "First name is required"),
		lastName: z.string().min(1, "Last name is required"),
		phone: z.string().min(7, "Phone is required"),
		contactEmail: emailSchema,
		company: z.string().min(1, "Company is required"),
	}),
	wifi: z.object({
		ssid: z.string().min(1, "SSID is required"),
		wifiPassword: z.string().min(1, "Password is required"),
		encryption: z.enum(["WPA", "WEP", "nopass"]),
		hidden: z.enum(["false", "true"]),
	}),
	email: z.object({
		emailTo: emailSchema,
		emailSubject: z.string().min(1, "Subject is required"),
		emailBody: z.string().min(1, "Body is required"),
	}),
	sms: z.object({
		smsPhone: z.string().min(7, "Phone is required"),
		smsBody: z.string().min(1, "Message is required"),
	}),
	geo: z.object({
		latitude: z
			.string()
			.refine((value) => !Number.isNaN(Number(value)), "Latitude must be numeric"),
		longitude: z
			.string()
			.refine((value) => !Number.isNaN(Number(value)), "Longitude must be numeric"),
	}),
	event: z
		.object({
			eventTitle: z.string().min(1, "Title is required"),
			eventLocation: z.string().min(1, "Location is required"),
			eventDescription: z.string().min(1, "Description is required"),
			eventStart: z.string().min(1, "Start date/time is required"),
			eventEnd: z.string().min(1, "End date/time is required"),
		})
		.refine((value) => new Date(value.eventEnd) > new Date(value.eventStart), {
			message: "End date/time must be after start date/time",
			path: ["eventEnd"],
		}),
	crypto: z.object({
		cryptoType: z.enum(["bitcoin", "ethereum", "litecoin"]),
		cryptoAddress: z.string().min(5, "Address is required"),
		cryptoAmount: z
			.string()
			.refine((value) => value.length === 0 || (!Number.isNaN(Number(value)) && Number(value) >= 0), {
				message: "Amount must be a positive number",
			}),
		cryptoMemo: z.string().optional(),
	}),
};

export const mapTypeFields: Record<DataType, Array<keyof GeneratorValues>> = {
	url: ["url"],
	text: ["text"],
	vcard: ["firstName", "lastName", "phone", "contactEmail", "company"],
	wifi: ["ssid", "wifiPassword", "encryption", "hidden"],
	email: ["emailTo", "emailSubject", "emailBody"],
	sms: ["smsPhone", "smsBody"],
	geo: ["latitude", "longitude"],
	event: ["eventTitle", "eventLocation", "eventDescription", "eventStart", "eventEnd"],
	crypto: ["cryptoType", "cryptoAddress", "cryptoAmount", "cryptoMemo"],
};

export const dataTypeLabels: Record<DataType, string> = {
	url: "URL",
	text: "Plain Text",
	vcard: "Contact",
	wifi: "Wi-Fi",
	email: "Email",
	sms: "SMS",
	geo: "Location",
	event: "Event",
	crypto: "Crypto",
};

function escapeVCard(value: string): string {
	return value.replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function unescapeVCard(value: string): string {
	return value.replace(/\\n/g, "\n").replace(/\\;/g, ";").replace(/\\,/g, ",");
}

function toIcsDateTime(localDateTime: string): string {
	const date = new Date(localDateTime);
	const year = String(date.getUTCFullYear());
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");

	return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function fromIcsDateTime(icsDateTime: string): string {
	const matched = icsDateTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (!matched) {
		return "";
	}

	const [, year, month, day, hours, minutes, seconds] = matched;
	const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)));

	const localYear = utcDate.getFullYear();
	const localMonth = String(utcDate.getMonth() + 1).padStart(2, "0");
	const localDay = String(utcDate.getDate()).padStart(2, "0");
	const localHours = String(utcDate.getHours()).padStart(2, "0");
	const localMinutes = String(utcDate.getMinutes()).padStart(2, "0");

	return `${localYear}-${localMonth}-${localDay}T${localHours}:${localMinutes}`;
}

export function validateForType(type: DataType, values: GeneratorValues): {
	isValid: boolean;
	errors: Partial<Record<keyof GeneratorValues, string>>;
} {
	const fields = mapTypeFields[type];
	const scopedValues = Object.fromEntries(fields.map((field) => [field, values[field]]));
	const parsed = schemas[type].safeParse(scopedValues);

	if (parsed.success) {
		return { isValid: true, errors: {} };
	}

	const errors: Partial<Record<keyof GeneratorValues, string>> = {};
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof GeneratorValues;
		if (key && !errors[key]) {
			errors[key] = issue.message;
		}
	}

	return { isValid: false, errors };
}

export function buildPayload(type: DataType, values: GeneratorValues): string {
	switch (type) {
		case "url":
			return values.url.trim();
		case "text":
			return values.text;
		case "vcard": {
			const firstName = escapeVCard(values.firstName.trim());
			const lastName = escapeVCard(values.lastName.trim());
			const company = escapeVCard(values.company.trim());
			const email = values.contactEmail.trim();
			const phone = values.phone.trim();

			return [
				"BEGIN:VCARD",
				"VERSION:3.0",
				`N:${lastName};${firstName};;;`,
				`FN:${firstName} ${lastName}`,
				`ORG:${company}`,
				`TEL:${phone}`,
				`EMAIL:${email}`,
				"END:VCARD",
			].join("\n");
		}
		case "wifi":
			return `WIFI:T:${values.encryption};S:${values.ssid};P:${values.wifiPassword};H:${values.hidden};;`;
		case "email": {
			const query = new URLSearchParams({
				subject: values.emailSubject,
				body: values.emailBody,
			});
			return `mailto:${values.emailTo}?${query.toString()}`;
		}
		case "sms":
			return `SMSTO:${values.smsPhone}:${values.smsBody}`;
		case "geo":
			return `geo:${values.latitude},${values.longitude}`;
		case "event":
			return [
				"BEGIN:VCALENDAR",
				"VERSION:2.0",
				"BEGIN:VEVENT",
				`SUMMARY:${values.eventTitle}`,
				`LOCATION:${values.eventLocation}`,
				`DESCRIPTION:${values.eventDescription}`,
				`DTSTART:${toIcsDateTime(values.eventStart)}`,
				`DTEND:${toIcsDateTime(values.eventEnd)}`,
				"END:VEVENT",
				"END:VCALENDAR",
			].join("\n");
		case "crypto": {
			const params = new URLSearchParams();
			if (values.cryptoAmount) {
				params.append("amount", values.cryptoAmount);
			}
			if (values.cryptoMemo) {
				params.append("message", values.cryptoMemo);
			}

			const query = params.toString();
			return `${values.cryptoType}:${values.cryptoAddress}${query ? `?${query}` : ""}`;
		}
		default:
			return "";
	}
}

export function parsePayloadToValues(type: DataType, payload: string): GeneratorValues {
	const values: GeneratorValues = { ...defaultValues };

	switch (type) {
		case "url":
			values.url = payload;
			return values;
		case "text":
			values.text = payload;
			return values;
		case "wifi": {
			const matched = payload.match(/^WIFI:T:(.*?);S:(.*?);P:(.*?);H:(.*?);;$/);
			if (matched) {
				const [, encryption, ssid, wifiPassword, hidden] = matched;
				values.encryption = (encryption as GeneratorValues["encryption"]) || "WPA";
				values.ssid = ssid;
				values.wifiPassword = wifiPassword;
				values.hidden = hidden === "true" ? "true" : "false";
			}
			return values;
		}
		case "email": {
			if (payload.startsWith("mailto:")) {
				const [addressPart, queryPart] = payload.slice("mailto:".length).split("?");
				values.emailTo = addressPart ?? "";
				const params = new URLSearchParams(queryPart ?? "");
				values.emailSubject = params.get("subject") ?? "";
				values.emailBody = params.get("body") ?? "";
			}
			return values;
		}
		case "sms": {
			if (payload.startsWith("SMSTO:")) {
				const smsBodyIndex = payload.indexOf(":", "SMSTO:".length);
				if (smsBodyIndex !== -1) {
					values.smsPhone = payload.slice("SMSTO:".length, smsBodyIndex);
					values.smsBody = payload.slice(smsBodyIndex + 1);
				}
			}
			return values;
		}
		case "geo": {
			if (payload.startsWith("geo:")) {
				const [latitude, longitude] = payload.slice("geo:".length).split(",");
				values.latitude = latitude ?? "";
				values.longitude = longitude ?? "";
			}
			return values;
		}
		case "event": {
			const lines = payload.split("\n");
			for (const line of lines) {
				if (line.startsWith("SUMMARY:")) {
					values.eventTitle = line.slice("SUMMARY:".length);
				}
				if (line.startsWith("LOCATION:")) {
					values.eventLocation = line.slice("LOCATION:".length);
				}
				if (line.startsWith("DESCRIPTION:")) {
					values.eventDescription = line.slice("DESCRIPTION:".length);
				}
				if (line.startsWith("DTSTART:")) {
					values.eventStart = fromIcsDateTime(line.slice("DTSTART:".length));
				}
				if (line.startsWith("DTEND:")) {
					values.eventEnd = fromIcsDateTime(line.slice("DTEND:".length));
				}
			}
			return values;
		}
		case "crypto": {
			const matched = payload.match(/^([a-zA-Z]+):([^?]+)(?:\?(.*))?$/);
			if (matched) {
				const [, cryptoType, cryptoAddress, query] = matched;
				if (["bitcoin", "ethereum", "litecoin"].includes(cryptoType)) {
					values.cryptoType = cryptoType as GeneratorValues["cryptoType"];
				}
				values.cryptoAddress = cryptoAddress ?? "";
				const params = new URLSearchParams(query ?? "");
				values.cryptoAmount = params.get("amount") ?? "";
				values.cryptoMemo = params.get("message") ?? "";
			}
			return values;
		}
		case "vcard": {
			const lines = payload.split("\n");
			for (const line of lines) {
				if (line.startsWith("N:")) {
					const [lastName, firstName] = line.slice("N:".length).split(";");
					values.firstName = unescapeVCard(firstName ?? "");
					values.lastName = unescapeVCard(lastName ?? "");
				}
				if (line.startsWith("ORG:")) {
					values.company = unescapeVCard(line.slice("ORG:".length));
				}
				if (line.startsWith("TEL:")) {
					values.phone = line.slice("TEL:".length);
				}
				if (line.startsWith("EMAIL:")) {
					values.contactEmail = line.slice("EMAIL:".length);
				}
			}
			return values;
		}
		default:
			return values;
	}
}
