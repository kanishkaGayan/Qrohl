export type DataType =
  | "url"
  | "text"
  | "vcard"
  | "wifi"
  | "email"
  | "sms"
  | "geo"
  | "event"
  | "crypto";

export type CodeFormat = "qr" | "barcode";

export interface GeneratorValues {
  url: string;
  text: string;
  firstName: string;
  lastName: string;
  phone: string;
  contactEmail: string;
  company: string;
  ssid: string;
  wifiPassword: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden: "false" | "true";
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  smsPhone: string;
  smsBody: string;
  latitude: string;
  longitude: string;
  eventTitle: string;
  eventLocation: string;
  eventDescription: string;
  eventStart: string;
  eventEnd: string;
  cryptoType: "bitcoin" | "ethereum" | "litecoin";
  cryptoAddress: string;
  cryptoAmount: string;
  cryptoMemo: string;
}

export interface HistoryItem {
  id: string;
  type: DataType;
  format: CodeFormat;
  payload: string;
  createdAt: string;
}

export type HistorySortOrder = "newest" | "oldest";

export interface HistoryQuery {
  page: number;
  pageSize: number;
  sortOrder: HistorySortOrder;
  dateFrom?: string;
  dateTo?: string;
}

export interface HistoryPage {
  items: HistoryItem[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  sortOrder: HistorySortOrder;
  dateFrom?: string;
  dateTo?: string;
}
