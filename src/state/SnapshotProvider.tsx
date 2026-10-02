import { createContext, type ReactNode } from "react";
import { useSnapshotController } from "./useSnapshotController";

export const SnapshotContext = createContext<
  ReturnType<typeof useSnapshotController> | undefined
>(undefined);

// One provider per React root/window; child features never open another connection.
export function SnapshotProvider({ children }: { children: ReactNode }) {
  const value = useSnapshotController();
  return (
    <SnapshotContext.Provider value={value}>
      {children}
    </SnapshotContext.Provider>
  );
}
