import { AppShell, PageLoader } from "@/components/platform";

export default function MissionDetailLoading() {
  return (
    <AppShell>
      <section className="page-container">
        <PageLoader />
      </section>
    </AppShell>
  );
}
