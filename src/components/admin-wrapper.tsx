"use client";

import { Suspense } from "react";
import { AdminPanelProvider } from "./admin-panel-provider";
import { AdminPanelOverlay } from "./admin-panel-overlay";

export function AdminWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AdminPanelProvider>
      {children}
      <Suspense fallback={null}>
        <AdminPanelOverlay />
      </Suspense>
    </AdminPanelProvider>
  );
}
