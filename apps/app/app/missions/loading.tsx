import { AppShell, PageLoader } from "@/components/platform";

export default function MissionsLoading() {
  return (
    <AppShell>
      <section className="page-container">
        <PageLoader />
      </section>
    </AppShell>
  );
}
