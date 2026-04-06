import { getHistoryAction } from "@/app/actions/history";
import { GeneratorDashboard } from "@/components/generator-dashboard";

export default async function Home() {
  const history = await getHistoryAction({
    page: 1,
    pageSize: 10,
    sortOrder: "newest",
  });

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <GeneratorDashboard initialHistory={history} />
      <footer className="mt-auto border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
        © 2026 Qrohl. All rights reserved. | Made by {" "}
        <a
          href="https://kanishka.dev/"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Kanishka Meddegoda
        </a>
      </footer>
    </div>
  );
}
