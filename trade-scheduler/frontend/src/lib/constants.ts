import { JobStatus, JobPriority } from "@/lib/api-client";
import { Clock, CheckCircle2, XCircle, Wrench, AlertCircle, ArrowUpCircle, ArrowDownCircle, MinusCircle } from "lucide-react";

export const TRADE_TYPES = [
  "Electrical",
  "Plumbing",
  "Carpentry",
  "Painting",
  "Roofing",
  "HVAC",
  "Landscaping",
  "General",
] as const;

export const STATUS_CONFIG = {
  [JobStatus.pending]: {
    label: "Pending",
    color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
    icon: Clock,
  },
  [JobStatus.in_progress]: {
    label: "In Progress",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    icon: Wrench,
  },
  [JobStatus.completed]: {
    label: "Completed",
    color: "text-green-500 bg-green-500/10 border-green-500/20",
    icon: CheckCircle2,
  },
  [JobStatus.cancelled]: {
    label: "Cancelled",
    color: "text-red-500 bg-red-500/10 border-red-500/20",
    icon: XCircle,
  },
};

export const PRIORITY_CONFIG = {
  [JobPriority.low]: {
    label: "Low",
    color: "text-gray-400 bg-gray-400/10 border-gray-400/20",
    icon: ArrowDownCircle,
  },
  [JobPriority.medium]: {
    label: "Medium",
    color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
    icon: MinusCircle,
  },
  [JobPriority.high]: {
    label: "High",
    color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    icon: ArrowUpCircle,
  },
  [JobPriority.urgent]: {
    label: "Urgent",
    color: "text-red-500 bg-red-500/10 border-red-500/20",
    icon: AlertCircle,
  },
};
