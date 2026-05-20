import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAUD(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

export function formatAusDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Not scheduled";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch (e) {
    return "Invalid date";
  }
}

export function formatAusDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "Not scheduled";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy h:mm a");
  } catch (e) {
    return "Invalid date";
  }
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\s+/g, "");
  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}
