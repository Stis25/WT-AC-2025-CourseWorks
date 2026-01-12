import React from "react";
import { BugPriority, BugStatus } from "../types";

export const StatusBadge: React.FC<{ status: BugStatus }> = ({ status }) => {
  const map: Record<BugStatus, { text: string; className: string }> = {
    new: { text: "New", className: "badge info" },
    in_progress: { text: "In progress", className: "badge info" },
    testing: { text: "Testing", className: "badge warn" },
    done: { text: "Done", className: "badge success" },
    closed: { text: "Closed", className: "badge danger" }
  };
  const item = map[status];
  return <span className={item.className}>{item.text}</span>;
};

export const PriorityBadge: React.FC<{ priority: BugPriority }> = ({ priority }) => {
  const map: Record<BugPriority, { text: string; className: string }> = {
    low: { text: "Low", className: "badge" },
    medium: { text: "Medium", className: "badge info" },
    high: { text: "High", className: "badge warn" },
    critical: { text: "Critical", className: "badge danger" }
  };
  const item = map[priority];
  return <span className={item.className}>{item.text}</span>;
};
