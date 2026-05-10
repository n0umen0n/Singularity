import { AppShell, PageLoader } from "@/components/platform";

export default function ProfileLoading() {
  return (
    <AppShell>
      <section className="page-container">
        <PageLoader />
      </section>
    </AppShell>
  );
}
