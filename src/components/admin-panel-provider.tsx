"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface AdminPanelContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const AdminPanelContext = createContext<AdminPanelContextType>({
  isOpen: false,
  toggle: () => {},
  open: () => {},
  close: () => {},
});

export function useAdminPanel() {
  return useContext(AdminPanelContext);
}

export function AdminPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AdminPanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </AdminPanelContext.Provider>
  );
}
