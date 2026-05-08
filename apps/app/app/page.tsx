"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell, PageLoader } from "@/components/platform";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/missions");
  }, [router]);

  return (
    <AppShell>
      <section className="page-container">
        <PageLoader />
      </section>
    </AppShell>
  );
}
