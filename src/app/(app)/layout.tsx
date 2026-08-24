import { AppShell } from "@/components/layout/app-shell";
import { OfflineSyncManager } from "@/components/offline-sync-manager";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineSyncManager />
      <AppShell>{children}</AppShell>
    </>
  );
}
