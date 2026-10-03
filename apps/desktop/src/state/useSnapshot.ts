import { useContext } from "react";
import { SnapshotContext } from "./SnapshotProvider";
export { errorText } from "../shared/errors";

export function useSnapshot() {
  const value = useContext(SnapshotContext);
  if (!value) throw new Error("useSnapshot requires SnapshotProvider");
  return value;
}
