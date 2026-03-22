import { getHistoryAction } from "@/app/actions/history";
import { GeneratorDashboard } from "@/components/generator-dashboard";

export default async function Home() {
  const history = await getHistoryAction({
    page: 1,
    pageSize: 10,
    sortOrder: "newest",
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <GeneratorDashboard initialHistory={history} />
    </div>
  );
}
