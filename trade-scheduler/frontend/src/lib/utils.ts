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
