// Web: no crash reporting (the web app is for development and account pages).
import type { ComponentType } from 'react';

export const crashReportingOn = false;
export const withCrashReporting = (Root: ComponentType): ComponentType => Root;
export function setCrashUser(_userId: string | null) {}
export function sendTestCrashReport(): boolean {
  return false;
}
