import { AppShell, PageLoader } from "@/components/platform";

export default function Loading() {
  return (
    <AppShell>
      <section className="page-container">
        <PageLoader />
      </section>
    </AppShell>
  );
}
