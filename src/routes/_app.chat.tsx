import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    temp: search.temp === "1" || search.temp === true ? ("1" as const) : undefined,
  }),
  beforeLoad: ({ search }) => {
    const id = crypto.randomUUID();
    throw redirect({
      to: "/c/$threadId",
      params: { threadId: id },
      search: search.temp ? { temp: "1" } : {},
    });
  },
});
