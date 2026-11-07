import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Architect Studio — plan Power BI & Tableau dashboards" },
      { name: "description", content: "Upload a CSV or Excel file to profile data quality, get grounded business questions, SQL, DAX and Tableau snippets, and a 16:9 dashboard mockup." },
      { property: "og:title", content: "Dashboard Architect Studio" },
      { property: "og:description", content: "Beginner-friendly, in-browser dashboard planning for Power BI and Tableau." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});